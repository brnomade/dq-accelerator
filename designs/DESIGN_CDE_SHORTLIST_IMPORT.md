# DESIGN: CDE Shortlist Import & Shortlist Tagging

## Purpose

Enable bulk loading of Critical Data Sets (CDS) and Critical Data Elements (CDE) from the existing "CDE Shortlist Assessment" Excel template at scale (~5,000 CDEs / ~200 CDS).

Alongside the import, this feature introduces a **Shortlist Group** concept. Cell colour in the template indicates which shortlist group a CDE belongs to — a priority tier signalling which CDEs should be fully configured first. All shortlisted CDEs are equally valid data; the grouping is a configuration priority signal, not a quality filter. The tag is stored in a dedicated relationship table and flows through to exports.

---

## New Concept: Shortlist Groups & Tags

A **Shortlist Group** is a named, colour-tagged priority bucket that can be assigned to a CDE. It answers: "how urgently does this CDE need to be fully configured?"

Key properties:
- A CDE with no active tag is not shortlisted.
- A CDE with an active tag belongs to one shortlist group at a time.
- All shortlist groups are equally "shortlisted" — they differ only in priority tier within a directorate.
- Groups have a display colour (hex) matching the colours used in the assessment template.
- Groups are **scoped to a directorate** — they are created per directorate during import and have no meaning outside it.
- Groups are user-manageable (label and colour can be renamed after import).
- Tags can be removed or reassigned at any time from the CDE panel form.

---

## Schema: Two New Tables, No Change to Existing Tables

### `shortlist_group` — editable, directorate-scoped

| Field | Type | Notes |
|-------|------|-------|
| `shortlist_group_id` | int | PK, auto-generated |
| `directorate_id` | int | FK → `directorate`. Scopes this group to one directorate |
| `shortlist_group_label` | str | User-facing name, e.g. "Priority 1" |
| `shortlist_colour_hex` | str | 6-char uppercase hex, e.g. "FFFF00". Used for colour swatches in the UI |
| `retiring_timestamp` | datetime | Soft-delete |

Groups are created automatically during import when a new colour is detected for a given directorate. Users can rename labels and change colours after import. Retiring a group does not remove CDE tags — those junction rows should be retired separately.

### `cde_shortlist_tag` — junction table, one active row per CDE maximum

| Field | Type | Notes |
|-------|------|-------|
| `cde_shortlist_tag_id` | int | PK, auto-generated |
| `critical_data_element_id` | int | FK → `critical_data_element` |
| `shortlist_group_id` | int | FK → `shortlist_group` |
| `retiring_timestamp` | datetime | Retiring this row removes or supersedes the tag |

**One active tag per CDE** is the intended constraint, enforced in application logic:
- When a new tag is applied, any existing active tag for that CDE is retired first (same operation, atomic).
- A retired row is the audit record of when the tag was removed or changed.

**No change to `critical_data_element`** — the existing table and its data are untouched.

### Placement in schema groups

Both tables sit in the **Data Quality Elements** group alongside `critical_data_element`.

---

## Template Format

**File:** `The CDE Shortlist Assessment.xlsx`, sheet `CDE Shortlist`

Transposed pivot / matrix layout:

```
Row 1:  "Name(s) of Critical Data Set (CDS)" | <CDS Name 1> | <CDS Name 2> | ... | <CDS Name N> | (empty)
Row 2+: "Data Field" / (blank)               | <field name> | <field name> | ...
```

- **Column A** — row labels (skipped)
- **Columns B onwards** — one CDS per column; number of CDS columns is not fixed
- **Row 1** — CDS names
- **Rows 2+** — data field names

**CDS column count detection:** scan row 1 from column index 1 (B) onwards. Stop at the first empty or whitespace-only cell. All columns before that stopping point are treated as CDS columns. There is no hard maximum — the parser adapts to however many CDS are defined in the file.

### Cell colour = shortlist group membership

- A cell with **any non-default colour** (fill or font) is shortlisted.
- Different colours represent different shortlist groups within the directorate.
- Cells with no meaningful colour are imported but are not shortlisted (no junction row created).
- The import brings in **all** non-empty field cells regardless of colour.

Different assessment workbooks use different colouring conventions:
- Some (e.g. the CDE Shortlist Assessment template) colour cells using **background fill**.
- Others (e.g. POAS-style workbooks) colour cells using **font colour** with no fill applied.
- Either convention, or a mix of both within the same file, is supported.

### Colour detection — combined fill and font signal

The parser checks both fill and font colour for each cell, in priority order:

**1. Fill colour (checked first)**

Read `ws[addr].s?.fgColor`. Normalise to 6-char uppercase hex:
- `.argb` (8-char): strip the leading 2 alpha chars.
- `.rgb` (6-char): use directly, uppercase.
- Treat `"FFFFFF"`, `"000000"`, absent, or theme index 0 or 1 as "no meaningful fill".

If a non-default fill is found, use it as the colour key. Do not check font colour.

**2. Font colour (checked if no fill found)**

Read `ws[addr].s?.font?.color`. Apply the same normalisation:
- `.rgb`: strip alpha, uppercase, reject `"FFFFFF"` and `"000000"` (explicit black = header/legend formatting, not a priority signal).
- `.theme`: map to approximate hex using the standard Office theme palette (see table below). Reject theme index 0 (background) and 1 (default text).

| Theme index | Approximate hex | Common name |
|-------------|----------------|-------------|
| 4 | `4472C4` | Accent 1 — blue |
| 5 | `ED7D31` | Accent 2 — orange |
| 6 | `A9D18E` | Accent 3 — green-grey |
| 7 | `FFC000` | Accent 4 — gold |
| 8 | `5B9BD5` | Accent 5 — light blue |
| 9 | `70AD47` | Accent 6 — green |

Unrecognised theme indices produce a neutral grey key (`808080`) so the group is still created and tagged, but the swatch renders grey.

**3. Uncoloured**

If neither fill nor font produces a meaningful colour, the cell is not shortlisted. It is still imported as a CDE record; no junction row is created.

**Fallback:** If `cellStyles: true` produces no colour data whatsoever from the file, import all fields as un-tagged and show an amber warning: "Cell colour detection unavailable — all CDEs imported without shortlist tags. Tags can be applied manually from the CDE panel."

### First data row detection

Some workbooks include one or more metadata rows between the CDS header row and the first CDE row (e.g. an owner/reporter row with a dark styled background). The parser auto-detects the first data row by scanning from row 2 downwards and skipping any row where the majority of CDS-column cells carry a dark themed background fill (Office theme index 0 — typically used for styled header rows). The first row that passes this check is treated as the start of CDE data.

### What the template provides

| Field | Source |
|-------|--------|
| `data_set_name` | Row 1, columns B onwards (dynamic column count) |
| `source_field_name` | All non-empty cell values from the first data row onwards |
| Shortlist group | Derived from cell fill colour, then font colour; null if neither is meaningful |

### What the template does NOT provide

All other CDE fields (`source_platform_name`, `source_system_name`, `source_database_name`, `source_table_name`, etc.) are left blank. Users complete these via the standard panel form post-import.

---

## Import Flow

### Step 1 — File Upload & Parse

User uploads a `.xlsx` file on the new "CDE Shortlist" tab in the Import screen.

Parser (`parseShortlistWorkbook`):
1. Load: `XLSX.read(buffer, { type: 'binary', cellStyles: true })`.
2. Identify target sheet: first sheet not matching "example", "instructions", "version control" (case-insensitive substring).
3. Read raw 2-D array: `XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })`.
4. Determine CDS column range: scan row 0 from index 1 onwards. Stop at the first index where the cell is empty or whitespace-only. All indices before the stop are CDS columns. No hard maximum.
5. For each CDS column index:
   - CDS name = row 0 value (trimmed).
   - For each row ≥ 1: if cell value is non-empty, record `{ fieldName: String(cell.v).trim(), colourHex }`.
   - `colourHex`: normalised 6-char uppercase hex, or `null` if no fill.
6. Collect `encounteredColours`: an ordered array of distinct hex values, appended on first encounter as the sheet is scanned left-to-right across columns, top-to-bottom within each column. Encounter order determines group numbering.
7. If `encounteredColours` is empty after full parse, set `fallbackMode = true`.

Returns `{ items: [{ cdsName, fields: [{ fieldName, colourHex }] }], encounteredColours, fallbackMode }`.

### Step 2 — Shortlist Group Resolution

Each import session **always creates new shortlist group records** — existing groups are never reused or matched by colour. This keeps import sessions independent and avoids confusion between groups from different assessment rounds.

Groups are numbered sequentially in the order their colour is **first encountered** scanning the sheet: left-to-right across CDS columns, top-to-bottom within each column. The first distinct colour found becomes "Group 1", the second "Group 2", and so on. A file with four distinct colours produces exactly four new records: Group 1 through Group 4.

For each colour in encounter order:
- Stage a new `shortlist_group` record:
  - `shortlist_group_label`: `"Group {N}"` where N is the 1-based encounter sequence number.
  - `shortlist_colour_hex`: the normalised hex.
  - `directorate_id`: the selected directorate (resolved in Step 3).
- Build `colourMap: { [hex]: staged_shortlist_group_id }`.

New records are written to `data.shortlist_group` as part of the apply commit — not before.

Show a **Group Preview** panel so the user knows what will be created:

```
Shortlist groups to be created for this import:
  ● FFFF00  →  Group 1
  ● 90EE90  →  Group 2
  ● FFD700  →  Group 3
```

Users can rename group labels after import via the Shortlist Group table view.

**Ordering note:** Steps 2 and 3 are interdependent. In the UI:
1. Directorate selection (Step 3) happens first — the directorate is needed to stage group records.
2. Group staging (Step 2) runs immediately after directorate is confirmed, before analysis.

### Step 3 — Directorate Resolution

| User type | Logic |
|-----------|-------|
| **Master** | Always show Directorate picker. Cannot proceed without selection. |
| **Non-master, 0 active stewardship rows** | Show Directorate picker. |
| **Non-master, all stewardship CDSs share one directorate** | Auto-resolve silently. Show read-only label "Importing into: {Directorate Name}". |
| **Non-master, CDSs span multiple directorates** | Show Directorate picker, pre-selected to the most common. User confirms or changes. |

Traversal: `stewardIdentity.id` → active `stewardship` rows → `critical_data_set_id` → `critical_data_set.directorate_id` → `directorate.directorate_name`.

### Step 4 — Analysis & Conflict Detection

With directorate and colour map resolved, categorise each CDS and CDE:

**CDS conflict** — name match in the selected directorate (case-insensitive trim):
- `'existing'` — CDS name already present; CDEs from the template attach to it.
- `'new'` — no match; new CDS record will be created.

**CDE conflict** — within a matched existing CDS, field name matches an existing `source_field_name` (case-insensitive trim):
- `'duplicate'` — field already exists in that CDS.
- `'new'` — no match.

Analysis output:
```js
{
  summary: { newCds, existingCds, newCde, duplicateCde },
  items: [
    {
      cdsName, cdsStatus, existingCdsId,
      fields: [{ fieldName, colourHex, shortlistGroupId, fieldStatus, existingCdeId }]
    }
  ]
}
```

### Step 5 — Conflict Review

Mirrors the delta import UX:

- **Summary banner**: "X new CDS, Y existing CDS | P new CDEs, Q duplicates"
- **No conflicts**: green notice + enabled Apply button.
- **Conflicts present**: conflict cards, Apply button enabled (all conflicts have a default resolution pre-set to Skip).

**Default resolution for all conflicts: Skip (keep existing)**. Users must actively choose an alternative.

#### CDS Conflict Card

```
┌──────────────────────────────────────────────────────┐
│  CDS  "Product_Inventory_Database"       [EXISTING]  │
├───────────────────────┬──────────────────────────────┤
│  Current record       │  Incoming (template)          │
│  ID: 14               │  Same name — attach CDEs here │
│  Directorate: HMCTS   │  {N} new + {M} duplicate CDEs │
│  {K} existing CDEs    │                               │
├───────────────────────┴──────────────────────────────┤
│  [Use existing CDS ✓]      [Create new CDS]           │
└──────────────────────────────────────────────────────┘
```

#### CDE Conflict Card

```
┌────────────────────────────────────────────────────────┐
│  CDE  "Product_ID"  in  "Product_Inventory..."  [DUPLICATE] │
├────────────────────────┬───────────────────────────────┤
│  Existing CDE #42      │  Incoming (template)           │
│  Platform: (blank)     │  field: Product_ID             │
│  System:   (blank)     │  shortlist: ● FFFF00           │
│  Database: (blank)     │                                │
│  Table:    (blank)     │                                │
├────────────────────────┴───────────────────────────────┤
│  [Skip ✓]                    [Import anyway]            │
└────────────────────────────────────────────────────────┘
```

### Step 6 — Apply

On confirm:

1. Commit any staged `shortlist_group` records to `data.shortlist_group`.
2. Resolve CDS records (create new or use existing per conflict resolutions).
3. For each CDE to be created:
   - Create `critical_data_element` row: `source_field_name` populated, all source system fields blank, no retiring_timestamp.
   - If `shortlistGroupId` is non-null: create a `cde_shortlist_tag` row linking the new CDE to the shortlist group.
4. For CDEs resolved as "Skip": no CDE record, no tag record.
5. Call `setData(newData)` + `persist(newData)`.
6. Show success banner: "Imported: X CDS, Y CDE (Z shortlisted across N groups)."

---

## Tag Management (Post-Import)

Once CDEs are in the system, shortlist tags are managed from the **CDE panel form**:

### Viewing the current tag

The CDE panel shows a "Shortlist Group" read-only or editable field. Value is the `shortlist_group_label` of the active `cde_shortlist_tag` row for that CDE, or "Not shortlisted" if none.

### Editing the tag

A dropdown in the CDE panel shows all active `shortlist_group` records for the CDE's directorate (resolved via `critical_data_set_id → critical_data_set.directorate_id`), plus a "None (remove tag)" option at the top.

- **Selecting a group**: retire any existing active `cde_shortlist_tag` row for this CDE (set `retiring_timestamp`), then create a new row pointing to the chosen group.
- **Selecting "None"**: retire the existing active tag row only. No new row created.
- **No change**: leave as-is.

This means the CDE panel form needs a new field section for shortlist management — a single dropdown + current tag display. The retiring of the old tag and creation of the new one happen atomically in the same state update.

---

## CSV Export Changes

### 1. Add shortlist group column

Add a `"Shortlist Group"` column to the CDE export. Value = `shortlist_group_label` resolved from the active `cde_shortlist_tag` row for that CDE. Empty string if not shortlisted.

### 2. Completeness filter — user-selectable, default "Complete only"

A CDE is **complete** if all four source system fields are non-empty:
- `source_platform_name`
- `source_system_name`
- `source_database_name`
- `source_table_name`

The export UI exposes a filter control with three options:

| Option | Behaviour |
|--------|-----------|
| **Complete only** (default) | Export CDEs where all four fields are populated. Incomplete CDEs are silently excluded. |
| **Incomplete only** | Export only CDEs where at least one of the four fields is blank. Useful for identifying what still needs to be filled in. |
| **All** | Export every CDE regardless of completeness. |

Whichever option is selected, the UI shows a count summary: "X complete, Y incomplete" so the user knows the split before downloading. Records remain in the store regardless of the filter — this is an export-time decision only.

---

## Placement

New tab **"CDE Shortlist"** in the Import screen, alongside "Full dataset" and "Delta".

---

## Out of Scope

- Populating source system fields at import time (skeleton records only)
- Importing stewardship, criticality scores, or rule allocations from this template
- Extending the Excel template itself
- Auto-updating existing CDE records (delta sync handles that)
- Screen-level shortlist tag visibility beyond the CDE panel (future task)
