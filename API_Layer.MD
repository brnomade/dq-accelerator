# AI Provider Integration -- Design Specification

Phase 4 feature. Builds directly on Phase 1.6 (Business Rule Assistant).
Reference BACKLOG.md for phase ordering and priority.

---

## Design principle

The prompt is the valuable artefact. The Business Rule Assistant already assembles a
rich, structured prompt from CDE context, profiling data, schema, dimensions, and
conversation instructions. That assembly logic is unchanged regardless of how the
prompt is delivered to the AI.

The delivery mechanism -- API call vs clipboard -- is the only thing that differs between
the two modes. All prompt construction, output parsing, proposal validation, and record
creation code is shared.

---

## Two modes

**Copy & Paste mode (default)**
The existing Phase 1.6 workflow. The app assembles the prompt and copies it to the
clipboard. The steward pastes it into their external AI tool (Copilot, Teams AI, etc.),
conducts the conversation there, then pastes the output back. The app parses the result.

No API key required. Works in any client environment. This remains the default and is
never removed -- it is always the fallback.

**API mode (opt-in)**
The app sends the prompt directly to a configured AI provider via HTTP. The conversation
happens inside the app. The AI response streams into the Stage 3 panel. Proposals are
extracted automatically without a paste step.

Requires an API key (or MSAL token for Copilot). Configured once in Settings.

---

## AIProvider module

New file: `src/85_ai_provider.js`
Slots between sidebar (80) and screen files (100+) in the build order.

### Provider config

Stored in localStorage key `moj_dq_provider_v1` (separate from the data store).

```js
// Config shape
{
  mode: 'copy' | 'api',
  apiType: 'claude' | 'openai' | 'copilot',  // only relevant when mode === 'api'
  apiKey: '...',         // Claude and OpenAI; stored in plaintext (POC only -- see security note)
  apiEndpoint: '...',    // Optional override for self-hosted / Azure OpenAI deployments
  saved_at: '...'
}
```

```js
function loadAIProvider() { /* reads moj_dq_provider_v1, returns config or default copy mode */ }
function saveAIProvider(config) { /* writes moj_dq_provider_v1 */ }
```

### invokeAI -- the single call surface

All AI-powered features call this function. They never reference the mode directly.

```js
// prompt:    string -- the fully assembled prompt
// history:   array  -- prior messages [{ role: 'user'|'assistant', content: '...' }]
//            Pass [] for first turn; pass accumulated history for follow-up turns
// onChunk:   function(text) -- called with each streamed token in API mode
//            Not called in copy mode (clipboard delivery has no streaming)
// onDone:    function(fullText) -- called with the complete response when finished
// onError:   function(message) -- called on failure
//
// In copy mode: copies prompt to clipboard, calls onDone(null) immediately.
//   The caller (Stage 2 panel) handles the UI transition to the paste zone.
// In API mode: sends prompt + history to provider, streams response, calls onDone(fullText).

async function invokeAI(prompt, history, onChunk, onDone, onError) {
  const config = loadAIProvider();
  if (config.mode === 'api') {
    await callProvider(prompt, history, config, onChunk, onDone, onError);
  } else {
    await navigator.clipboard.writeText(prompt).catch(() => {});
    onDone(null);  // null signals copy mode -- caller shows paste zone
  }
}
```

### API adapters

One function per provider, all with the same signature.

```js
async function callProvider(prompt, history, config, onChunk, onDone, onError) {
  switch (config.apiType) {
    case 'claude':  return callClaude(prompt, history, config, onChunk, onDone, onError);
    case 'openai':  return callOpenAI(prompt, history, config, onChunk, onDone, onError);
    case 'copilot': return callCopilot(prompt, history, config, onChunk, onDone, onError);
  }
}

// Claude: POST https://api.anthropic.com/v1/messages (SSE streaming)
// OpenAI: POST https://api.openai.com/v1/chat/completions (SSE streaming)
// Copilot: Microsoft Graph API -- requires MSAL token from Phase 2 Azure AD registration
//          (Copilot adapter depends on Phase 2 being in place; built last)
```

Streaming is handled via `ReadableStream` / `EventSource` per provider's SSE format.
The `onChunk` callback receives each text delta as it arrives.

---

## How the Business Rule Assistant stages adapt

Stage 1 (Define) and Stage 4 (Commit) are **identical in both modes**.
Only Stage 2 and Stage 3 change.

### Stage 2 -- Copy mode (unchanged)
Shows the prompt textarea, character count, and "Copy to clipboard" button.
On copy: advances to Stage 3 paste zone (existing behaviour).

### Stage 2 -- API mode
- "Copy to clipboard" button replaced by "Send to AI" button
- On click: calls `invokeAI(prompt, [], onChunk, onDone, onError)`
- Streaming response displayed inline (progressive text reveal)
- On completion (`onDone`): response stored in assistant state, auto-advances to Stage 3

### Stage 3 -- Copy mode (unchanged)
Paste zone textarea + "Parse result" button (existing behaviour).

### Stage 3 -- API mode
- No paste zone -- response arrived automatically from Stage 2
- Shows the AI response text (full, scrollable, readonly)
- "Parse proposals" runs automatically on load; shows found proposals or gaps
- "Continue conversation" input: text field to send a follow-up message
  - Calls `invokeAI(followUpText, history, ...)` with accumulated history
  - History maintained in assistant state: `conversationHistory` array of `{ role, content }`
  - Enables the same multi-turn clarification flow the clipboard approach supports externally

---

## Multi-turn conversation (API mode only)

The clipboard flow is inherently multi-turn -- the steward goes back and forth in their
external AI tool before pasting a final proposal. In API mode this happens inside the app.

State additions to `moj_dq_assistant_v1` when in API mode:
```js
conversationHistory: [
  { role: 'user',      content: '<full initial prompt>' },
  { role: 'assistant', content: '<AI first response>' },
  { role: 'user',      content: '<steward follow-up>' },
  { role: 'assistant', content: '<AI clarification>' },
  ...
]
```

The history is passed to `invokeAI` on each turn. Providers include it in their
`messages` array so the AI retains full context.

History is not persisted across sessions (cleared on "Start new").

---

## Settings panel addition

New section in the existing Settings panel (`70_header_footer.js` SettingsPanel component):

```
AI Provider
  ( ) Copy & Paste  -- No API key required. Works in any environment.
  ( ) API           -- Connect directly to an AI service.

  [shown when API selected]
  Provider:  [ Claude (Anthropic) v ]
  API Key:   [ ________________________ ]  (password input)
  Endpoint:  [ optional -- leave blank for default ]
  [ Test connection ]  <-- sends a minimal test prompt, shows OK or error
```

Provider options shown in selector: Claude (Anthropic), OpenAI, Microsoft Copilot*.
*Copilot option shown only if Phase 2 MSAL is configured (token available).

---

## Security note

API keys stored in `moj_dq_provider_v1` in localStorage are accessible to any script
running on the same origin. This is acceptable for a demo or single-user POC but is not
appropriate for a shared or production deployment.

When Phase 2 (SharePoint Lists) is in place, the API key should be moved to a user-scoped
SharePoint List item or retrieved via a server-side proxy, removing it from the client.

Until Phase 2: display a visible warning in the Settings panel when an API key is saved.

---

## Files affected

| File | Change |
|------|--------|
| `src/85_ai_provider.js` | New -- full AIProvider module (~200 lines) |
| `src/70_header_footer.js` | Add AI Provider section to SettingsPanel |
| `src/250_screen_assistant.js` | Stage 2/3 adapt based on provider mode; conversation history state |

All other files unchanged. Future AI features (CDE description generation, rule suggestions,
etc.) get both modes automatically by calling `invokeAI()`.

---

## Dependency on Phase 2

The Copilot adapter requires the MSAL.js token acquisition already built for Phase 2
(SharePoint Lists). Build the Copilot adapter after Phase 2 is in place to reuse the
Azure AD app registration and token flow.

Claude and OpenAI adapters have no Phase 2 dependency and can be built independently.

---

## What this does NOT change

- Prompt assembly logic (G2 context builder) -- unchanged
- Output parser (G4.2) -- unchanged; parses text whether from API or paste
- Proposal validator (G5) -- unchanged
- Review card and commit (G6, G7) -- unchanged
- Copy & Paste mode -- never removed; always available as fallback
