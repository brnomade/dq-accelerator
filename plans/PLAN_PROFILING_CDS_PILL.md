# PLAN: CDS Context Pill on Profiling Field Rows

## Goal

Add a compact CDS pill at the field/column row level in the Profiling page so a data steward can see at a glance which Critical Data Set(s) each field belongs to, without leaving the page.

---

## Spec (confirmed)

- **One pill per field row**, regardless of how many CDS the field belongs to
- **Fixed-width column** always present in the grid (between origin badge and field name); the column is empty for SQL-only fields
- **Pill shown** only when the field is a CDE (has at least one `cdeId`)
- **Pill label:** fixed text `CDS`
- **Tooltip:** one line per CDS, format `{Agency name} / {CDS name}`, in Agency–CDS order
- **SQL-only fields:** column slot is empty, no pill rendered

---

## Data chain

`critical_data_element.critical_data_set_id`
→ `critical_data_set.directorate_id`
→ `directorate.executive_agency_id`
→ `executive_agency.agency_name`

---

## Changes

### 1. `ProfilingView` — build `cdeInfoMap` (lookup map)

In the `useMemo` block that feeds `tableGroups`, build a map before calling `buildProfilingAgenda`:

```
cdeInfoMap: Map<cde_id (int), { cdsId, cdsName, agencyName }>
```

Derived from:
- `data.critical_data_set` keyed by `critical_data_set_id`
- `data.directorate` keyed by `directorate_id`
- `data.executive_agency` keyed by `executive_agency_id`
- `data.critical_data_element` → joins all three

Pass `cdeInfoMap` as a new parameter to `buildProfilingAgenda`.

### 2. `buildProfilingAgenda` — add `cdsInfoList` per field

Signature change: accept `cdeInfoMap`.

When collecting `cdeIds` for a field entry, also accumulate unique CDS entries:

```js
fieldMap[key].cdsInfoList  // array of { cdsId, cdsName, agencyName }, deduplicated by cdsId
```

Add `cdsInfoList` to each field object pushed into `tg.fields`.

### 3. `FieldRow` — new CDS pill column

**Grid template change:**
```
// before
22px 60px 1fr 60px 60px 44px repeat(N, 38px) 96px
// after
22px 60px 52px 1fr 60px 60px 44px repeat(N, 38px) 96px
```

**New cell (between badge and field name):**
- If `cdsInfoList.length > 0`: render pill with label `CDS`, styled similarly to origin badge (small monospace, coloured)
- Colour: green (`var(--green)`) — CDS is a CDE-world concept
- Tooltip: `cdsInfoList.map(c => c.agencyName + ' / ' + c.cdsName).join('\n')`
- If empty: render empty `<div/>`

### 4. Column headers in `TableGroupRow`

**Grid template change:** same as FieldRow (`22px 60px 52px 1fr ...`)

Add an empty `<div style={colHdrStyle}/>` between the badge header cell and the Field header cell.

### 5. `DimCoverageFooter` — grid realignment

Update grid template to match the field row exactly:
```
22px 60px 52px 1fr 60px 60px 44px repeat(N, 38px) 96px
```

Apply `gridColumn: '1 / 5'` on the "Dim coverage" label so it spans the check + badge + CDS + field-name columns.

Add three empty cells for phys type, log type, and rules columns; keep N dim% cells and the final empty action cell.

---

## Files changed

| File | Change |
|------|--------|
| `200_screen_ddl.js` | All of the above — single file |

---

## No schema / state / storage changes

No new localStorage keys, no new tables, no export impact.

---

## Out of scope

- No Agency pill (Agency surfaced only in tooltip)
- No click action on the CDS pill
- No CDS pill on the table header row
