# DESIGN — Delta Sync Workflow

## Overview

The delta sync workflow enables a single **master steward** to own the authoritative dataset while distributing editing rights to named **stewards**. Stewards work on local copies, export only their changes (a delta), and the master reviews and merges those changes back into the master dataset. The master then publishes a new version that stewards can refresh from.

No server, database, or network connection is required. All data exchange happens through downloaded JSON files.

---

## Roles

| Role | Description |
|------|-------------|
| **Master steward** | Owns the canonical dataset. Imports Excel to seed data. Merges steward deltas. Publishes new master versions. Identified by a `stewardship` record with `critical_data_set_id = 0`. |
| **Steward** | Works on a local copy seeded from the master JSON. Makes changes within their PK namespace. Exports deltas for the master to review. |

---

## Full Workflow

### Step 1 — Master seeds data from Excel

The master imports the Excel workbook via the Import screen.

- `data` state is populated from all 18 schema tables
- `moj_dq_store_v1` (localStorage) is written with the full dataset
- No base version or snapshot is recorded at this point

### Step 2 — Master exports Master JSON

The master navigates to Export and clicks **Export master JSON**.

**What happens in code (`230_screen_export.js:11–33`):**
- `nextMasterVersion(current)` generates a version string: `master-YYYYMMDD-NNN`
- The payload is written: `{ _type:'master', _version, _exported_at, data }`
- `saveBaseVersion(version)` writes the new version to `moj_dq_base_version` (localStorage)
- File downloaded as `dq_master_<version>.json`

**Note:** The master's own base snapshot is NOT recorded at export time. The master's snapshot is only set when they imported the Excel (step 1) or a merged dataset.

### Step 3 — Steward imports Master JSON

The steward receives the master JSON file and imports it via the Import screen.

**What happens in code (`210_screen_import.js:212–225`):**
- `data` state is replaced with `payload.data`
- `saveBaseVersion(payload._version)` records the version the steward is working from
- `saveBaseSnapshot(buildSnapshot(importedData))` records a per-record hash of every delta-tracked table at this point — this is the reference for future delta calculation
- Steward's environment is now a clean working copy at that version

### Step 4 — Steward configures identity and makes changes

The steward opens Settings, selects their identity, and optionally designates as master (master only).

All new records created by a steward receive PKs in their **steward namespace**: `steward_id × 1,000,000 + sequence`. This guarantees no PK collision between stewards or between stewards and the master.

**Delta-tracked tables** — all 22 SCHEMA tables are included in a delta export (expanded from the original 7 in commit `1181a83`):

Reference lookups: `executive_agency_type`, `steward_role_type`, `quality_dimension`, `criticality_group`, `criticality_level`
Organisational hierarchy: `executive_agency`, `directorate`
People: `data_patron`, `data_owner`, `data_steward`
Weights: `criticality_group_weight`, `quality_dimension_weight`
Core data model: `critical_data_set`, `critical_data_element`, `stewardship`, `cde_criticality`
Rules: `data_quality_rule`, `data_quality_rule_allocation`
Shortlists: `shortlist_group`, `cde_shortlist_tag`
Profiling: `source_table_ddl`, `field_profiling`

**Snapshot staleness risk:** if a steward's base snapshot was saved before `DELTA_TABLES` was expanded, the tables added by the expansion will have no snapshot entries. All records in those tables will appear as `inserted` on the next delta export, even if the steward made no changes to them. The remedy is to re-import the master JSON, which resets the snapshot to cover all current tables.

### Step 5 — Steward exports delta

The steward navigates to Export and clicks **Export delta**.

**What happens in code (`230_screen_export.js:35–59`):**
- `buildDelta(data, baseSnapshot)` compares every delta-tracked record's current hash against the stored base snapshot:
  - Record in data but not in snapshot → **inserted**
  - Record in both, hash changed, no retiring_timestamp → **updated**
  - Record in both, hash changed, retiring_timestamp set → **retired**
  - Record in both, hash unchanged → not included
- Payload: `{ _type:'delta', _steward_id, _steward_name, _base_version, _exported_at, _total_changes, changes }`
- File downloaded as `dq_delta_<steward_name>_<timestamp>.json`

**Important:** The delta contains only the diff since the last base snapshot. If the steward imports a new master JSON without exporting their delta first, their uncommitted changes are lost.

### Step 6 — Master imports and reviews steward delta

The master drops the steward's delta file onto the Import screen.

**What happens in code (`210_screen_import.js`, `71_master_version.js`):**

`processDelta(delta, masterData, baseSnapshot)` runs three passes:

1. **PK remapping** — steward-namespace PKs on inserted records are replaced with fresh master-sequence PKs (global max + 1). A `pkRemap` lookup is built for FK resolution.
2. **FK remapping** — any FK fields pointing to newly inserted records are updated using `pkRemap`.
3. **Conflict detection** — for each updated record:
   - If master's current hash equals the base snapshot hash → master has not touched it → **auto-apply** steward's version
   - If master's current hash differs from base snapshot → both parties changed it → **conflict**, requires manual resolution
   - All retirements are always surfaced as conflicts — master must decide

The master reviews conflict cards (showing context fields + diff, with "Show all fields" toggle) and chooses **Keep master** or **Accept steward** for each. Once all conflicts are resolved, **Apply merge** is clicked.

`applyMergedChanges(masterData, processResult, resolutions)` produces the merged dataset. A merge report JSON is automatically downloaded.

### Step 7 — Master exports new Master JSON

After the merge is applied, the master navigates to Export and exports a new Master JSON.

- Version is auto-incremented: `master-YYYYMMDD-002`, etc.
- The new file contains the merged dataset and is distributed to all stewards

**Current gap:** After a merge completes, the app shows a summary screen with no prompt or navigation shortcut to Export. The master must remember to export manually.

### Step 8 — Steward refreshes environment

The steward imports the new Master JSON (same as Step 3).

- Their entire local dataset is replaced with the new master version
- Their base snapshot is reset to the new version
- They are now ready to begin a new editing cycle

**Current gap:** Any local changes the steward made that were not exported in a delta before this import are silently lost. There is no warning prompt or "you have unpublished changes" detection.

---

## Data Structures

### Master JSON (`dq_master_<version>.json`)
```json
{
  "_type": "master",
  "_version": "master-20260618-001",
  "_exported_at": "2026-06-18T10:00:00.000Z",
  "data": { "<table_name>": [ ...records ] }
}
```

### Steward Delta (`dq_delta_<name>_<timestamp>.json`)
```json
{
  "_type": "delta",
  "_steward_id": 2,
  "_steward_name": "Jane Smith",
  "_base_version": "master-20260618-001",
  "_exported_at": "2026-06-18T14:30:00.000Z",
  "_total_changes": 5,
  "changes": {
    "<table_name>": {
      "inserted": [ ...full records ],
      "updated":  [ ...full records ],
      "retired":  [ ...pk values ]
    }
  }
}
```

### Design decision: full rows in inserts and updates

Both `inserted` and `updated` entries in a delta carry the **complete record** — every column defined in SCHEMA — not just the changed fields.

**Why full rows for inserts** is self-evident: the record does not exist in the master and must be created in full.

**Why full rows for updates** (not a partial diff):

1. **Wholesale replacement at merge time.** `applyMergedChanges` replaces the master record entirely: `r[pkField] === row[pkField] ? row : r`. A partial update would silently destroy every field not present in the diff.

2. **Conflict resolution requires the complete intended state.** When the master reviews a conflict, the steward row is shown as the full proposed record. A partial row would make it impossible to know what the record should look like after acceptance — the master would see only what changed, not the authoritative new state.

3. **No risk of silent data loss.** With partial updates, a field valid in the master but absent from the steward diff would be destroyed on merge without any conflict being raised. Full rows mean the merge is always a predictable, auditable replacement.

4. **Column completeness is structurally guaranteed.** `buildDelta` serialises the full in-memory row object, so whatever the application stored is exported. No column selection or projection is applied. Verified against SCHEMA in July 2026: all rows in a real steward delta matched their SCHEMA column sets exactly.

### Merge Report (`dq_merge_report_<timestamp>.json`)
```json
{
  "_type": "merge_report",
  "_merged_at": "...",
  "_steward_name": "Jane Smith",
  "_base_version": "master-20260618-001",
  "pk_remaps": { "<table>": { "<old_pk>": <new_pk> } },
  "applied": { "<table>": { "inserted": N, "updated": N, "retired": N } },
  "conflicts": [ { "table", "pk", "type", "resolution" } ],
  "summary": { "total_inserted", "total_updated", "total_retired", "total_conflicts" }
}
```

---

## localStorage Keys

| Key | Written by | Content |
|-----|-----------|---------|
| `moj_dq_store_v1` | Any import, any edit | Full data state + savedAt timestamp |
| `moj_dq_base_version` | Master export (step 2), steward import (step 3) | Version string, e.g. `master-20260618-001` |
| `moj_dq_base_snapshot` | Steward import (step 3) | `{ table: { pk: hash } }` for delta-tracked tables |
| `moj_dq_steward_identity` | Settings panel | `{ id, name }` of the active steward |

---

## PK Namespace Strategy

| Actor | PK range | Example |
|-------|---------|---------|
| Master | Global max + 1 (no prefix) | 1, 2, 3, ... |
| Steward N | N × 1,000,000 + 1 to N × 1,000,000 + 999,999 | 2,000,001 – 2,999,999 |

Steward-namespace PKs on inserted records are **remapped to master sequence** during delta processing (step 6). Stewards and master therefore never share PK values in the canonical dataset.

---

## Known Gaps and Limitations

| # | Gap | Impact | Status |
|---|-----|--------|--------|
| G1 | No prompt to export Master JSON after merge completes | Master may forget step 7; stewards work from a stale version | **Fixed (KI-10)** — "Export new Master JSON" CTA added to post-merge summary |
| G2 | No "unsaved changes" warning before steward imports a new Master JSON | Steward loses uncommitted work silently | **Fixed (KI-11)** — intercept with change count + Export/Import anyway/Cancel actions |
| G3 | Master base snapshot not updated after merge | If master edits records directly after a merge (without re-importing their own export), conflict detection in the next round may produce phantom conflicts | **Fixed (KI-12)** — snapshot refreshed in `handleApplyMerge` |
| G4 | No version compatibility check | If a steward's delta references `_base_version` that does not match master's current version, the merge proceeds anyway with potentially stale conflict baselines | **Fixed (KI-13)** — amber version-mismatch warning shown in merge panel |
| G5 | One steward delta at a time | The master must merge and export between each steward's delta; there is no multi-delta batch merge | Open |
| G6 | KI-6 — +CDS/+CDE inoperable after import on fresh session | Steward may create records outside their namespace or fail to create them; causes downstream delta issues (KI-7) | Open |

---

## Sequence Diagram (happy path)

```
Master                          Steward(s)
  |                                |
  |-- Import Excel ------------->  |
  |-- Export Master JSON ------->  |
  |                                |-- Import Master JSON
  |                                |-- Set identity
  |                                |-- Make changes
  |                                |-- Export delta -------> [file]
  |<-- Import delta [file] -----   |
  |-- Review / resolve conflicts   |
  |-- Apply merge                  |
  |-- Export new Master JSON --->  |
  |                                |-- Import new Master JSON
  |                                |   (base snapshot reset)
  |                                |-- Begin next cycle
```
