#!/usr/bin/env python3
"""
spike_athena_cors.py
====================
Browser-compatibility spike test for the DQ Accelerator V2 cloud database integration.

Tests whether a browser can make direct fetch() calls to AWS Athena and S3 without
CORS errors, and validates that SigV4 signing and credentials work end-to-end.

All AWS signing uses Python stdlib only (hmac, hashlib, urllib) -- no boto3 or AWS SDK.
This mirrors exactly what the browser SigV4 implementation (15_aws_sigv4.js) will do.

Tests run:
  1. CORS preflight (OPTIONS) to Athena API endpoint
  2. Authenticated Athena API call (ListWorkGroups) -- validates credentials + signing
  3. CORS preflight (OPTIONS) to S3 endpoint
  4. Authenticated S3 PutObject -- validates bucket write access
  5. Authenticated S3 GetObject -- validates bucket read access
  6. Authenticated S3 DeleteObject -- cleanup

Usage:
  python spike_athena_cors.py

  Or with env vars:
  AWS_REGION=eu-west-2 AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \\
    DQ_S3_BUCKET=my-bucket python spike_athena_cors.py
"""

import os
import sys
import hmac
import json
import hashlib
import datetime
import urllib.request
import urllib.error
import urllib.parse

# ---------------------------------------------------------------------------
# CONFIGURATION
# Edit these values directly, or set the corresponding environment variables.
# ---------------------------------------------------------------------------
CONFIG = {
    "region":                os.environ.get("AWS_REGION",                ""),
    "access_key_id":         os.environ.get("AWS_ACCESS_KEY_ID",         ""),
    "secret_access_key":     os.environ.get("AWS_SECRET_ACCESS_KEY",     ""),
    "session_token":         os.environ.get("AWS_SESSION_TOKEN",         ""),   # optional
    "s3_bucket":             os.environ.get("DQ_S3_BUCKET",              ""),
    "athena_workgroup":      os.environ.get("DQ_ATHENA_WORKGROUP",       "primary"),
    "query_results_prefix":  os.environ.get("DQ_QUERY_RESULTS_PREFIX",   "athena-spike-results/"),
    "s3_test_key":           "dq-spike-test/cors_spike_probe.txt",
}

# Simulated browser Origin header used in CORS preflight tests.
BROWSER_ORIGIN = "http://localhost"

# ---------------------------------------------------------------------------
# RESULT TRACKING
# ---------------------------------------------------------------------------
results = []

def record(test_name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    results.append((test_name, status, detail))
    marker = "\033[92mPASS\033[0m" if passed else "\033[91mFAIL\033[0m"
    print(f"  [{marker}] {test_name}")
    if detail:
        for line in detail.strip().splitlines():
            print(f"         {line}")

# ---------------------------------------------------------------------------
# SigV4 SIGNING  (stdlib only -- hmac, hashlib)
# This Python implementation is the reference for the browser JS version.
# ---------------------------------------------------------------------------

def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def _hmac_sha256(key: bytes, data: str) -> bytes:
    return hmac.new(key, data.encode("utf-8"), hashlib.sha256).digest()

def _signing_key(secret_key: str, date_stamp: str, region: str, service: str) -> bytes:
    k_date    = _hmac_sha256(("AWS4" + secret_key).encode("utf-8"), date_stamp)
    k_region  = _hmac_sha256(k_date, region)
    k_service = _hmac_sha256(k_region, service)
    k_signing = _hmac_sha256(k_service, "aws4_request")
    return k_signing

def sign_request(method: str, url: str, headers: dict, body: bytes,
                 config: dict, service: str) -> dict:
    """
    Returns a copy of headers with Authorization, X-Amz-Date, X-Amz-Content-Sha256
    (and X-Amz-Security-Token if session_token is set) added.
    """
    parsed       = urllib.parse.urlparse(url)
    host         = parsed.netloc
    uri          = parsed.path or "/"
    query_string = parsed.query or ""

    now          = datetime.datetime.now(datetime.timezone.utc)
    amz_date     = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp   = now.strftime("%Y%m%d")

    payload_hash = _sha256_hex(body)

    signed_headers_map = dict(headers)
    signed_headers_map["host"]                  = host
    signed_headers_map["x-amz-date"]            = amz_date
    signed_headers_map["x-amz-content-sha256"]  = payload_hash
    if config.get("session_token"):
        signed_headers_map["x-amz-security-token"] = config["session_token"]

    signed_header_names = ";".join(sorted(k.lower() for k in signed_headers_map))

    canonical_headers = "".join(
        f"{k.lower()}:{signed_headers_map[k]}\n"
        for k in sorted(signed_headers_map, key=str.lower)
    )

    canonical_request = "\n".join([
        method,
        uri,
        query_string,
        canonical_headers,
        signed_header_names,
        payload_hash,
    ])

    credential_scope = f"{date_stamp}/{config['region']}/{service}/aws4_request"
    string_to_sign   = "\n".join([
        "AWS4-HMAC-SHA256",
        amz_date,
        credential_scope,
        _sha256_hex(canonical_request.encode("utf-8")),
    ])

    signing_key = _signing_key(
        config["secret_access_key"], date_stamp, config["region"], service
    )
    signature = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    auth_header = (
        f"AWS4-HMAC-SHA256 Credential={config['access_key_id']}/{credential_scope}, "
        f"SignedHeaders={signed_header_names}, "
        f"Signature={signature}"
    )

    out = dict(signed_headers_map)
    out["authorization"]       = auth_header
    out["x-amz-date"]          = amz_date
    out["x-amz-content-sha256"] = payload_hash
    if config.get("session_token"):
        out["x-amz-security-token"] = config["session_token"]
    # Remove 'host' -- urllib adds it automatically
    out.pop("host", None)
    return out

# ---------------------------------------------------------------------------
# HTTP HELPERS
# ---------------------------------------------------------------------------

def http_request(method: str, url: str, headers: dict, body: bytes = b""):
    """Returns (status_code, response_headers_dict, body_bytes)."""
    req = urllib.request.Request(url, data=body if body else None, method=method)
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()
    except Exception as e:
        return 0, {}, str(e).encode()

def cors_preflight(url: str, request_method: str, request_headers: str):
    """
    Simulates a browser CORS preflight OPTIONS request.
    Returns (status_code, response_headers).
    """
    headers = {
        "Origin":                          BROWSER_ORIGIN,
        "Access-Control-Request-Method":   request_method,
        "Access-Control-Request-Headers":  request_headers,
    }
    status, resp_headers, _ = http_request("OPTIONS", url, headers)
    return status, resp_headers

def has_cors_header(resp_headers: dict) -> bool:
    """True if the response includes a permissive Access-Control-Allow-Origin."""
    acao = resp_headers.get("Access-Control-Allow-Origin", "")
    return acao in ("*", BROWSER_ORIGIN)

# ---------------------------------------------------------------------------
# TEST 1 — CORS preflight to Athena
# ---------------------------------------------------------------------------

def test_athena_cors_preflight(config: dict):
    print("\n[Test 1] CORS preflight to Athena API endpoint")
    url = f"https://athena.{config['region']}.amazonaws.com/"
    status, resp_headers = cors_preflight(
        url,
        request_method="POST",
        request_headers="authorization, content-type, x-amz-date, x-amz-security-token",
    )
    acao = resp_headers.get("Access-Control-Allow-Origin", "(not present)")
    detail = (
        f"OPTIONS {url}\n"
        f"Response status: {status}\n"
        f"Access-Control-Allow-Origin: {acao}\n"
        f"Access-Control-Allow-Methods: {resp_headers.get('Access-Control-Allow-Methods', '(not present)')}\n"
        f"Access-Control-Allow-Headers: {resp_headers.get('Access-Control-Allow-Headers', '(not present)')}"
    )
    record("Athena CORS preflight", has_cors_header(resp_headers), detail)

# ---------------------------------------------------------------------------
# TEST 2 — Authenticated Athena API call (ListWorkGroups)
# ---------------------------------------------------------------------------

def test_athena_auth(config: dict):
    print("\n[Test 2] Authenticated Athena API call (ListWorkGroups)")
    url  = f"https://athena.{config['region']}.amazonaws.com/"
    body = json.dumps({}).encode("utf-8")
    base_headers = {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AmazonAthena.ListWorkGroups",
    }
    signed = sign_request("POST", url, base_headers, body, config, "athena")
    signed["Content-Type"] = "application/x-amz-json-1.1"
    signed["X-Amz-Target"] = "AmazonAthena.ListWorkGroups"

    status, _, resp_body = http_request("POST", url, signed, body)
    ok = status == 200
    try:
        parsed = json.loads(resp_body)
        wg_names = [wg.get("Name") for wg in parsed.get("WorkGroups", [])]
        detail = f"HTTP {status} — WorkGroups found: {wg_names}"
    except Exception:
        detail = f"HTTP {status} — Response: {resp_body[:300].decode(errors='replace')}"
    record("Athena authenticated API call (ListWorkGroups)", ok, detail)

# ---------------------------------------------------------------------------
# TEST 3 — CORS preflight to S3
# ---------------------------------------------------------------------------

def test_s3_cors_preflight(config: dict):
    print("\n[Test 3] CORS preflight to S3 endpoint")
    url = f"https://{config['s3_bucket']}.s3.{config['region']}.amazonaws.com/"
    status, resp_headers = cors_preflight(
        url,
        request_method="PUT",
        request_headers="authorization, content-type, x-amz-date, x-amz-content-sha256, x-amz-security-token",
    )
    acao = resp_headers.get("Access-Control-Allow-Origin", "(not present)")
    detail = (
        f"OPTIONS {url}\n"
        f"Response status: {status}\n"
        f"Access-Control-Allow-Origin: {acao}\n"
        f"Note: S3 CORS is opt-in per bucket. If this FAILS, add a CORS rule to the bucket "
        f"(AllowedOrigin: *, AllowedMethod: GET/PUT/DELETE, AllowedHeader: *)."
    )
    record("S3 CORS preflight", has_cors_header(resp_headers), detail)

# ---------------------------------------------------------------------------
# TEST 4 — Authenticated S3 PutObject
# ---------------------------------------------------------------------------

def test_s3_put(config: dict):
    print("\n[Test 4] Authenticated S3 PutObject")
    key  = config["s3_test_key"]
    url  = f"https://{config['s3_bucket']}.s3.{config['region']}.amazonaws.com/{key}"
    body = b"dq-accelerator-cors-spike-probe"
    base_headers = {"Content-Type": "text/plain"}
    signed = sign_request("PUT", url, base_headers, body, config, "s3")
    signed["Content-Type"] = "text/plain"

    status, _, resp_body = http_request("PUT", url, signed, body)
    ok = status in (200, 204)
    detail = f"HTTP {status} — PUT s3://{config['s3_bucket']}/{key}"
    if not ok:
        detail += f"\nResponse: {resp_body[:300].decode(errors='replace')}"
    record("S3 PutObject", ok, detail)
    return ok

# ---------------------------------------------------------------------------
# TEST 5 — Authenticated S3 GetObject
# ---------------------------------------------------------------------------

def test_s3_get(config: dict):
    print("\n[Test 5] Authenticated S3 GetObject")
    key = config["s3_test_key"]
    url = f"https://{config['s3_bucket']}.s3.{config['region']}.amazonaws.com/{key}"
    signed = sign_request("GET", url, {}, b"", config, "s3")

    status, _, resp_body = http_request("GET", url, signed)
    ok = status == 200 and b"dq-accelerator" in resp_body
    detail = (
        f"HTTP {status} — GET s3://{config['s3_bucket']}/{key}\n"
        f"Body: {resp_body[:100].decode(errors='replace')}"
    )
    record("S3 GetObject", ok, detail)

# ---------------------------------------------------------------------------
# TEST 6 — Authenticated S3 DeleteObject (cleanup)
# ---------------------------------------------------------------------------

def test_s3_delete(config: dict):
    print("\n[Test 6] Authenticated S3 DeleteObject (cleanup)")
    key = config["s3_test_key"]
    url = f"https://{config['s3_bucket']}.s3.{config['region']}.amazonaws.com/{key}"
    signed = sign_request("DELETE", url, {}, b"", config, "s3")

    status, _, resp_body = http_request("DELETE", url, signed)
    ok = status in (200, 204)
    detail = f"HTTP {status} — DELETE s3://{config['s3_bucket']}/{key}"
    if not ok:
        detail += f"\nResponse: {resp_body[:300].decode(errors='replace')}"
    record("S3 DeleteObject (cleanup)", ok, detail)

# ---------------------------------------------------------------------------
# VALIDATION
# ---------------------------------------------------------------------------

def validate_config(config: dict) -> list:
    missing = []
    required = ["region", "access_key_id", "secret_access_key", "s3_bucket"]
    for key in required:
        if not config.get(key):
            missing.append(key)
    return missing

# ---------------------------------------------------------------------------
# SUMMARY AND RECOMMENDATION
# ---------------------------------------------------------------------------

def print_summary():
    print("\n" + "=" * 60)
    print("SPIKE TEST SUMMARY")
    print("=" * 60)
    for name, status, _ in results:
        marker = "\033[92mPASS\033[0m" if status == "PASS" else "\033[91mFAIL\033[0m"
        print(f"  [{marker}] {name}")

    athena_cors = next((s for n, s, _ in results if "Athena CORS" in n), None)
    s3_cors     = next((s for n, s, _ in results if "S3 CORS" in n), None)
    athena_auth = next((s for n, s, _ in results if "ListWorkGroups" in n), None)
    s3_put      = next((s for n, s, _ in results if "PutObject" in n), None)

    print("\nRECOMMENDATION")
    print("-" * 60)

    if athena_cors == "PASS" and s3_cors == "PASS" and athena_auth == "PASS" and s3_put == "PASS":
        print("  All critical tests passed.")
        print("  Direct browser → AWS calls are viable.")
        print("  Proceed to Phase 1 of PLAN_V2_CLOUD_DATABASE.md.")

    elif athena_auth == "PASS" and s3_put == "PASS" and (athena_cors == "FAIL" or s3_cors == "FAIL"):
        print("  Credentials and signing work correctly.")
        if athena_cors == "FAIL":
            print("  Athena CORS preflight FAILED: browser fetch() to Athena will be blocked.")
        if s3_cors == "FAIL":
            print("  S3 CORS preflight FAILED.")
            print("  Fix: add a CORS configuration to the S3 bucket (AllowedOrigin: *,")
            print("       AllowedMethod: GET PUT DELETE, AllowedHeader: *).")
        print("  If S3 CORS can be fixed but Athena CORS cannot, a local Python proxy")
        print("  is required for Athena calls. Raise with the team before implementing.")

    elif athena_auth == "FAIL":
        print("  Athena authenticated call FAILED.")
        print("  Check: region, access key, secret key, session token (if STS),")
        print("  and that the IAM user/role has athena:ListWorkGroups permission.")
        print("  Fix credentials before retrying.")

    elif s3_put == "FAIL":
        print("  S3 PutObject FAILED.")
        print("  Check: bucket name, region, and that the IAM user/role has")
        print("  s3:PutObject permission on the bucket.")

    else:
        print("  One or more tests failed. Review the output above for details.")

    print("=" * 60)

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("DQ Accelerator V2 — AWS Browser Compatibility Spike Test")
    print("=" * 60)

    missing = validate_config(CONFIG)
    if missing:
        print("\nERROR: missing required configuration values:")
        for key in missing:
            print(f"  - {key}")
        print("\nSet them as environment variables or edit the CONFIG dict at the top of this file.")
        print("Required: region, access_key_id, secret_access_key, s3_bucket")
        sys.exit(1)

    print(f"\nConfiguration:")
    print(f"  Region:         {CONFIG['region']}")
    print(f"  Access Key ID:  {CONFIG['access_key_id'][:8]}{'*' * max(0, len(CONFIG['access_key_id']) - 8)}")
    print(f"  Session Token:  {'set' if CONFIG.get('session_token') else 'not set'}")
    print(f"  S3 Bucket:      {CONFIG['s3_bucket']}")
    print(f"  Workgroup:      {CONFIG['athena_workgroup']}")
    print(f"  Origin header:  {BROWSER_ORIGIN}")
    print()

    test_athena_cors_preflight(CONFIG)
    test_athena_auth(CONFIG)
    test_s3_cors_preflight(CONFIG)
    put_ok = test_s3_put(CONFIG)
    if put_ok:
        test_s3_get(CONFIG)
        test_s3_delete(CONFIG)
    else:
        print("\n[Test 5] S3 GetObject — SKIPPED (PutObject failed)")
        print("[Test 6] S3 DeleteObject — SKIPPED (PutObject failed)")

    print_summary()

if __name__ == "__main__":
    main()
