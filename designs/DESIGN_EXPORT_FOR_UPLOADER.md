## Design: Data Uploader Export

### 1. Where it lives

A new **Uploader** tab on a redesigned Export page. As part of this feature the Export page moves from its current single-scroll layout to a **tabbed layout** matching the Import page pattern.

The Uploader tab is **visible only to the Master Steward** — hidden entirely for non-master users, consistent with the Master Export and TABLE_GROUPS behaviour.

#### 1.1 Export page tab structure

| Tab | Visible to | Description |
|-----|-----------|-------------|
| Master | Master only | Versioned master JSON for steward distribution |
| Uploader | Master only | Filtered CSV ZIP for DQ engine (this feature) |
| Backup | All users | Full CSV ZIP, all tables |
| Tables | Master only | Per-group and per-table CSV downloads |
| Delta | Non-master only | Steward delta JSON |

Each tab renders only its own content. Tabs hidden from the current user are not rendered at all (not greyed out — simply absent).

---

### 2. Scope of the check

The validity check runs against `data_quality_rule_allocation` records only, at export time. Nothing is written back to the working dataset — this is a filter applied to the export payload, not a status stored anywhere.

All other 21 tables are exported exactly as the Backup Export feature does them: the only filter applied to those tables is whether soft-deleted records are included or excluded, controlled by the same toggle carried over to this tab.

The Steward's live editing experience is completely untouched.

---

### 3. What counts as malformed (the filter logic)

An allocation is excluded from the export if **any** of the following are true:

**Missing dependencies**
- `data_quality_rule.sql_code` is blank
- The linked `critical_data_element`'s `source_database_name`, `source_table_name`, or `source_field_name` is blank

**Broken template substitution**
- `sql_code` contains any of the placeholder tokens `{SOURCE_DATABASE_NAME}`, `{SOURCE_TABLE_NAME}`, or `{SOURCE_FIELD_NAME}` that remain literally present after substitution from the CDE's source fields (i.e. the token was not replaced because the corresponding CDE field was blank)
- Substitution results in a structurally empty clause (e.g. an empty `FROM`)

**Basic sanity checks**
- `sql_code` is whitespace-only or trivially empty after trimming
- Unbalanced quote or parenthesis counts in `sql_code` (a cheap character-count check — not a SQL parser)

Explicitly **out of scope** for this check:
- `source_snapshot_filter` — not checked; whether a snapshot filter is required cannot be reliably inferred from the schema
- `bumper_value` / tolerance being unset — a separate completeness concern, not an SQL-validity one, and does not block engine execution

---

### 4. Export output

Two files are produced at the end of the process:

#### 4.1 Uploader ZIP (always produced)

- **Format**: ZIP archive of CSV files — same structure and file set as the Backup Export (all 22 tables, one CSV per table)
- **Allocation filter**: `data_quality_rule_allocation.csv` contains only allocations that passed the validity check; all other CSVs are unaffected
- **Soft-deleted records**: controlled by a toggle identical to the one on the Backup tab (default: off — live records only). Soft-deleted records on non-allocation tables are included or excluded per the toggle; soft-deleted allocations that also fail validity are excluded regardless
- **Filename**: `dq_uploader_YYYYMMDDHHMMSS.zip`
- **Versioning**: none — no version counter, no localStorage tracking (same pattern as Backup Export)

#### 4.2 Exclusion receipt (produced only when exclusions exist)

A JSON receipt documenting every excluded allocation with its reasons. Produced as a second browser download immediately after the ZIP, only when one or more allocations were excluded. When all allocations pass (zero exclusions) no receipt file is generated.

- **Filename**: `dq_uploader_receipt_YYYYMMDDHHMMSS.json` (same timestamp as the ZIP)
- **Purpose**: gives the Master Steward a shareable record to communicate back to field stewards which rules or CDEs need attention before the next uploader export
- **Future compatibility**: the `_type` field is set to `"uploader_exclusion_receipt"` to support a future feature where a steward can import the receipt to generate a task list; IDs are included alongside human-readable names for that reason

**Receipt JSON structure:**

```json
{
  "_type": "uploader_exclusion_receipt",
  "_generated_at": "ISO-8601 timestamp",
  "_total_evaluated": 51,
  "_total_included": 42,
  "_total_excluded": 9,
  "excluded_allocations": [
    {
      "data_quality_rule_allocation_id": 123,
      "critical_data_set_name": "Prisoner Record",
      "critical_data_element_id": 45,
      "critical_data_element_name": "prison_number",
      "data_quality_rule_id": 67,
      "data_quality_rule_name": "Null check",
      "reasons": [
        "Missing source_table_name on CDE",
        "Unresolved placeholder {SOURCE_FIELD_NAME} in sql_code"
      ]
    }
  ]
}
```

Both IDs and human-readable names are included so the receipt is useful both as a readable document and as a machine-processable import in the future feature.

---

### 5. Why this satisfies the original concern

The DQ engine only ever consumes what's exported. By gating at the export boundary rather than at data entry, editing, or engine execution:
- Stewards, Owners, and Patrons can leave rules partially built indefinitely with zero friction.
- The engine never sees a malformed SQL definition in the first place, so it can't fail on one.
- No new schema, no new stored flag, no risk of a stored status drifting out of sync with reality — the check is always computed fresh from current field values at the moment of export.
- No SQL parsing or engineering judgment is introduced into the tool, keeping the Data Engineer-displacement principle intact.
- The exclusion receipt closes the communication loop: the Master Steward can share it with field stewards to identify exactly which rules or CDEs need attention before the next export cycle, without requiring a separate process or manual note-taking.

---

### 6. User Interface Design

Silent filtering is the wrong approach — the first time anyone notices a rule was excluded would be when it's missing from a report. The design therefore always shows a review screen before generating the file.

#### UX Flow

**Step 1 — Uploader tab settings**
The Master Steward navigates to the Uploader tab. They see:
- A short description of what the export does
- A soft-deleted records toggle (same as Backup tab)
- An **"Export for Uploader"** button

**Step 2 — Review screen (inline, replaces tab content)**
On clicking the button, the tab content transitions to a review screen — no modal, no new page. The review screen shows:

- **Headline counts**: e.g. *"42 of 51 Rule Allocations will be included. 9 excluded."*
- **Two-section layout**:
  - *Excluded* — expanded by default; lists each excluded allocation with: CDS name, CDE name, Rule name, and the specific reason(s) it failed (e.g. "Missing source_table_name", "Unresolved placeholder {SOURCE_FIELD_NAME} in sql_code")
  - *Included* — collapsed by default (the non-interesting case); shows just the count with an expand toggle to view the full list
- **No inline editing** — this is a review screen only. If the Master Steward wants to fix something, they cancel, fix it in the normal editing views, and re-run the export

**Step 3 — Explicit confirmation**
Two buttons:
- **"Export Included Only"** — proceeds with the filtered set; triggers the ZIP download followed immediately by the receipt JSON download (if any allocations were excluded); label shows what will be produced, e.g. *"Export ZIP + receipt"* when exclusions exist, *"Export ZIP"* when all allocations passed
- **"Cancel"** — returns to the Uploader tab settings (Step 1), toggle state preserved, nothing generated

No silent default — the Master Steward must actively confirm they have seen the exclusion list.

**Step 4 — Output**
Clicking the confirm button triggers the downloads in sequence: the ZIP first (`dq_uploader_YYYYMMDDHHMMSS.zip`), then the receipt (`dq_uploader_receipt_YYYYMMDDHHMMSS.json`) if exclusions exist. Both files share the same timestamp. The tab then returns to the Step 1 settings view.

---

### 7. Out of scope for this feature

- Any changes to how the Delta, Master, Backup, or Tables tabs work (they are restructured into tabs but their behaviour is unchanged)
- Any stored validity status on rules or allocations
- Any SQL execution or parsing beyond the character-count sanity checks described in Section 3
- Import of the exclusion receipt to generate a steward task list — the `_type` field and IDs are included in the receipt format to support this as a future feature, but the import flow itself is not part of this feature
