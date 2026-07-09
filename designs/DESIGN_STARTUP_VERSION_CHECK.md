# DESIGN — Startup Version Check Against Shared Master Folder

## Status

**Exploratory — not committed to implementation.**  
Captured for reference ahead of a multi-steward pilot. Real-world usage will inform which option is most appropriate before development begins.

---

## Problem Statement

Stewards currently have no automatic way to know whether their local copy is behind the latest master version. They must either be told out-of-band (email, Teams message) that a new master has been published, or remember to check the Import screen manually. In a multi-steward team, this creates a risk of:

- Stewards making changes on a stale copy, increasing conflict surface on the next delta merge
- Stewards exporting deltas based on an outdated base version (KI-13 warns on this, but doesn't prevent it)
- Coordination overhead on the master steward to notify everyone each time a new version is published

---

## Desired Behaviour

On application startup (or page refresh), if the user already has data loaded:

1. The app checks whether a newer master JSON is available in a configured shared location
2. If a newer version is found: a non-blocking banner is shown at the top of the screen
3. The banner tells the steward which version they are on, which version is available, and what to do

**Banner copy (example):**
> A newer master is available: **master-20260618-003**. You are on **master-20260618-001**.  
> Export your delta first, then refresh your copy from Import.

The check is passive — it does not block the app, does not auto-import, and does not require the steward to act immediately.

---

## Technical Constraint: Browser Sandbox

The app is served as a local `file://` HTML file. Browsers block JavaScript from reading the filesystem arbitrarily. The app cannot simply be pointed at a folder path — the browser security model prevents this. All approaches below work within that constraint.

---

## Option A — File System Access API (Recommended)

### How it works

Modern Chromium browsers (Chrome 86+, Edge 86+) expose `window.showDirectoryPicker()`. The user grants permission to a specific folder once via a native OS folder dialog. The browser returns a `FileSystemDirectoryHandle` — a live reference the app can read from on subsequent visits.

### Workflow

**One-time setup (in Settings):**
1. User clicks "Set master folder"
2. Native OS folder picker opens; user selects the OneDrive-synced folder where master JSONs are published (e.g. `OneDrive\DQ Masters\`)
3. The `FileSystemDirectoryHandle` is stored in IndexedDB (localStorage cannot hold object handles)
4. Settings confirms: "Master folder configured. App will check for updates on startup."

**Every subsequent startup:**
1. App loads, reads `moj_dq_base_version` from localStorage
2. Retrieves the stored `FileSystemDirectoryHandle` from IndexedDB
3. If the handle exists: requests read permission (may require one user click after browser restart)
4. Scans the folder for files matching `dq_master_*.json`
5. Extracts the version string from each filename (no need to parse file contents for the check)
6. Compares the latest available version against the stored base version
7. If newer version found: renders startup banner with version info and recommended actions

**On the master side:**
- After exporting a new master JSON from the Export screen, master saves the file to the shared OneDrive folder (manual step, or optionally offered as "Save to master folder" on the Export screen — see Future Enhancements)
- All synced team members' browsers will pick it up on next startup

### Considerations

| Factor | Detail |
|--------|--------|
| Browser support | Chrome 86+, Edge 86+ only. Firefox and Safari do not support this API. |
| Permission model | Permission granted once per folder. May need one re-click per browser session depending on OS/browser security policy. Enterprise Chrome/Edge can be configured to persist permissions. |
| Network dependency | None — reads from local OneDrive sync folder. Fully offline capable. |
| OneDrive requirement | Requires OneDrive folder to be synced locally (standard in enterprise Windows). |
| `file://` compatibility | File System Access API works from `file://` origin in Chromium. |
| IndexedDB | Already supported in `file://` origin; no new dependency. |

### Effort estimate

Medium. New components required:
- IndexedDB read/write wrapper (small utility, ~30 lines)
- Settings section: "Master folder" with configure/clear actions
- Startup check function (async, reads handle, scans directory, compares versions)
- Startup banner component (non-blocking, dismissible)

No changes to the delta sync logic, schema, or existing import/export flows.

---

## Option B — Hosted URL with CORS

### How it works

The master JSON is hosted at a known URL (Azure Blob Storage, SharePoint with API access, or a static host). The app `fetch()`es that URL at startup, reads the `_version` field, and compares it against the stored base version.

### Workflow

1. In Settings, user pastes a URL pointing to the latest master JSON (or a version manifest file)
2. App fetches the URL at startup using `fetch()`
3. Parses `payload._version` from the response
4. Compares with `loadBaseVersion()`
5. Shows banner if newer

### Considerations

| Factor | Detail |
|--------|--------|
| Browser support | Universal — works in all browsers |
| CORS | The hosting endpoint must return `Access-Control-Allow-Origin: *`. OneDrive and SharePoint sharing links do **not** include CORS headers by default. Would require Azure Blob Storage, a dedicated SharePoint CORS configuration (IT-managed), or a third-party static host. |
| Network dependency | Requires network access on startup. App is currently fully offline. |
| Master workflow | Master must upload to the hosted location as a separate step from their normal export (two actions: export to disk, then upload to host). |
| Organisational overhead | High — CORS-enabled hosting requires IT setup and ongoing maintenance. |

**Verdict:** Organisationally expensive for the marginal gain over Option A in an enterprise Windows / OneDrive environment.

---

## Option C — Manual "Check for updates" (No Automatic Detection)

### How it works

No automatic startup check. A "Check for updates" button is added to Settings or the Import screen. When clicked, it opens a standard file picker — user selects the latest master JSON manually. The app reads the `_version` field **without importing the data** and compares it with the stored version. Shows a banner if newer.

### Workflow

1. User clicks "Check for updates" in Settings
2. File picker opens; user selects the latest master JSON from their OneDrive folder
3. App reads `_version` only (does not replace data)
4. If newer: shows banner with version info and recommended actions
5. If up to date: "You are on the latest version."

### Considerations

| Factor | Detail |
|--------|--------|
| Browser support | Universal — standard `<input type="file">` |
| Effort | Very low — reuses existing file-reading logic; no IndexedDB, no folder permissions |
| UX | Requires the steward to actively check; won't catch people who forget |
| Reliability | Effective only if stewards have a habit of checking before starting work |

**Verdict:** Good as a fallback for non-Chromium users, or as a quick interim measure before Option A is implemented.

---

## Comparison Summary

| | Option A | Option B | Option C |
|---|---------|---------|---------|
| Automatic startup check | Yes | Yes | No (manual) |
| Browser support | Chrome / Edge only | All browsers | All browsers |
| Network required | No | Yes | No |
| IT setup needed | No | Yes (CORS) | No |
| Implementation effort | Medium | Medium (app) + High (infra) | Very low |
| Works offline | Yes | No | Yes |
| Recommended | **Yes (primary)** | No | Yes (fallback / interim) |

---

## Recommended Path (when ready to implement)

1. **Implement Option C first** — very low effort, no browser restrictions, gives stewards a manual safety net immediately
2. **Implement Option A alongside Settings** — add the folder handle configuration and automatic startup check for Chrome/Edge users
3. **Option B only if** the team moves to a server-hosted model (Phase 2/3 SharePoint backend) where CORS is already solved

---

## Future Enhancements (not in scope now)

- **"Save to master folder" on Export screen** — after exporting master JSON, offer to write the file directly to the configured master folder (File System Access API write permission). Eliminates the manual save step for the master.
- **Startup check frequency setting** — check only once per day rather than every page load, to avoid repeated permission prompts.
- **Version manifest file** — instead of scanning for `dq_master_*.json` filenames, maintain a `dq_version_manifest.json` in the shared folder that lists all published versions. Faster to read and avoids directory enumeration.
- **Auto-refresh prompt** — if the steward has no uncommitted changes (KI-11 check), offer a one-click "Refresh now" that directly imports the newer master JSON from the shared folder.

---

## Open Questions (to be answered by pilot experience)

1. Are all stewards on Chrome or Edge? (determines whether Option A is universally viable)
2. Should the version check be automatic on every startup, or triggered manually? (frequency vs. friction)
3. Is there a natural shared location already in use (OneDrive team folder, SharePoint library) that all stewards have synced?
4. Does the master want the Export screen to write directly to the shared folder, or is a manual "save to folder" step acceptable?
5. How quickly does the team need to be notified of new master versions? (near-real-time vs. next-login)
