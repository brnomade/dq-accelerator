// ===============================================================================
// AWS SIGNATURE VERSION 4 SIGNING -- foundation utility
//
// Signs browser fetch() requests for AWS APIs using SubtleCrypto only.
// No AWS SDK is loaded; nothing is added to template.html.
//
// Dependencies: NONE. Pure SubtleCrypto + JS builtins. This file is numbered 15
// precisely because it depends on nothing -- it must sit below every consumer.
//
// Callers: 47_connector_athena.js (all Athena API and S3 calls)
// Reference implementation: tests/spike_athena_cors.py (sign_request), which was
// validated end-to-end against live Athena and S3 endpoints on 2026-09-24.
// ===============================================================================

const SIGV4_ALGORITHM = 'AWS4-HMAC-SHA256';

// ---------------------------------------------------------------------------
// Low-level primitives
// ---------------------------------------------------------------------------

// SubtleCrypto is only exposed in a secure context. file:// and https:// both
// qualify; plain http:// on a non-localhost origin does not. Fail loudly here
// rather than letting callers hit an opaque "cannot read property digest" error.
function sigv4AssertCrypto() {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error(
      'Web Crypto (SubtleCrypto) is unavailable. AWS signing requires a secure ' +
      'context -- open the app via file:// or https://, not plain http://.'
    );
  }
}

function sigv4Utf8(str) {
  return new TextEncoder().encode(str);
}

function sigv4Hex(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

async function sigv4Sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return sigv4Hex(digest);
}

async function sigv4Hmac(keyBytes, dataString) {
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign({ name: 'HMAC' }, key, sigv4Utf8(dataString));
  return new Uint8Array(sig);
}

// Four-step key derivation: secret -> date -> region -> service -> aws4_request
async function sigv4SigningKey(secretAccessKey, dateStamp, region, service) {
  const kDate    = await sigv4Hmac(sigv4Utf8('AWS4' + secretAccessKey), dateStamp);
  const kRegion  = await sigv4Hmac(kDate, region);
  const kService = await sigv4Hmac(kRegion, service);
  return await sigv4Hmac(kService, 'aws4_request');
}

// ---------------------------------------------------------------------------
// Canonicalisation helpers
// ---------------------------------------------------------------------------

// '2026-09-24T12:36:00.000Z' -> { amzDate: '20260924T123600Z', dateStamp: '20260924' }
function sigv4Timestamps() {
  const amzDate = new Date().toISOString()
    .replace(/[:-]/g, '')
    .replace(/\.\d{3}/, '');
  return { amzDate: amzDate, dateStamp: amzDate.slice(0, 8) };
}

// encodeURIComponent leaves !'()* unescaped; RFC 3986 (and SigV4) require them escaped.
function sigv4Encode(str) {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    function (c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); }
  );
}

// Query parameters sorted by name, then by value. Returns '' when there is no query.
function sigv4CanonicalQuery(searchParams) {
  const pairs = [];
  searchParams.forEach(function (value, name) { pairs.push([name, value]); });
  pairs.sort(function (a, b) {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    return 0;
  });
  return pairs.map(function (p) {
    return sigv4Encode(p[0]) + '=' + sigv4Encode(p[1]);
  }).join('&');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Signs a request and returns a NEW headers object to hand straight to fetch().
//
//   method       'GET' | 'POST' | 'PUT' | 'DELETE'
//   url          full absolute URL, including any query string
//   headers      request headers to sign (e.g. Content-Type, X-Amz-Target)
//   body         request body as a string, or '' / null for no body
//   credentials  { accessKeyId, secretAccessKey, sessionToken? }
//   region       e.g. 'eu-west-1'
//   service      e.g. 'athena' or 's3'
//
// Returns the caller's headers plus Authorization, X-Amz-Date,
// X-Amz-Content-Sha256, and X-Amz-Security-Token when a session token is set.
//
// Note: 'host' is included in the signature (the spec requires it) but is
// deliberately NOT returned -- browsers forbid setting the Host header, and
// fetch() supplies it automatically.
async function signAwsRequest(method, url, headers, body, credentials, region, service) {
  sigv4AssertCrypto();

  if (!credentials || !credentials.accessKeyId || !credentials.secretAccessKey) {
    throw new Error('signAwsRequest: credentials must include accessKeyId and secretAccessKey.');
  }
  if (!region)  throw new Error('signAwsRequest: region is required.');
  if (!service) throw new Error('signAwsRequest: service is required.');

  const parsed         = new URL(url);
  const httpMethod     = String(method).toUpperCase();
  const canonicalUri   = parsed.pathname || '/';
  const canonicalQuery = sigv4CanonicalQuery(parsed.searchParams);

  const stamps    = sigv4Timestamps();
  const amzDate   = stamps.amzDate;
  const dateStamp = stamps.dateStamp;

  const bodyBytes = (body === null || body === undefined || body === '')
    ? new Uint8Array(0)
    : (body instanceof Uint8Array ? body : sigv4Utf8(String(body)));
  const payloadHash = await sigv4Sha256Hex(bodyBytes);

  // --- Step 1: canonical request -------------------------------------------
  const toSign = {};
  Object.keys(headers || {}).forEach(function (k) {
    toSign[k.toLowerCase()] = String(headers[k]).trim().replace(/\s+/g, ' ');
  });
  toSign['host']                 = parsed.host;   // includes :port when present
  toSign['x-amz-date']           = amzDate;
  toSign['x-amz-content-sha256'] = payloadHash;
  if (credentials.sessionToken) {
    toSign['x-amz-security-token'] = credentials.sessionToken;
  }

  const headerNames       = Object.keys(toSign).sort();
  const signedHeaderNames = headerNames.join(';');
  const canonicalHeaders  = headerNames.map(function (n) {
    return n + ':' + toSign[n] + '\n';
  }).join('');

  const canonicalRequest = [
    httpMethod,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaderNames,
    payloadHash,
  ].join('\n');

  // --- Step 2: string to sign ----------------------------------------------
  const credentialScope = dateStamp + '/' + region + '/' + service + '/aws4_request';
  const stringToSign = [
    SIGV4_ALGORITHM,
    amzDate,
    credentialScope,
    await sigv4Sha256Hex(sigv4Utf8(canonicalRequest)),
  ].join('\n');

  // --- Steps 3 and 4: derive key, sign -------------------------------------
  const signingKey = await sigv4SigningKey(credentials.secretAccessKey, dateStamp, region, service);
  const signature  = sigv4Hex(await sigv4Hmac(signingKey, stringToSign));

  // --- Assemble outgoing headers -------------------------------------------
  const out = {};
  Object.keys(headers || {}).forEach(function (k) { out[k] = headers[k]; });

  out['Authorization'] = SIGV4_ALGORITHM +
    ' Credential=' + credentials.accessKeyId + '/' + credentialScope +
    ', SignedHeaders=' + signedHeaderNames +
    ', Signature=' + signature;
  out['X-Amz-Date']           = amzDate;
  out['X-Amz-Content-Sha256'] = payloadHash;
  if (credentials.sessionToken) {
    out['X-Amz-Security-Token'] = credentials.sessionToken;
  }
  return out;
}
