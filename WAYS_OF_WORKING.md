# Ways of Working

This document describes the development workflow for the DQ Accelerator. Follow it consistently — the documentation and build artefacts are structured around it.

---

## The workflow at a glance

```
Discuss → Design → Plan → Review → Implement → Document → Build → Test
```

Every feature, enhancement, or non-trivial bug fix follows this sequence. Steps cannot be reordered. Implementation does not begin until the design and plan have been reviewed and approved.

---

## Step 1 — Discuss

Clarify the requirement with the team before writing anything. Agree on:

- What the change is and why it is needed
- Whether it is a new feature, an enhancement to an existing feature, or a bug fix
- Rough scope and any known constraints

---

## Step 2 — Design

Write a design document in `designs/DESIGN_FEATURE_NAME.md`.

A design document covers:

- **Problem** — what the current behaviour is and why it is insufficient
- **Solution** — the proposed approach at the UI and data model level
- **Screens and components affected** — which files change and how
- **Edge cases and constraints** — anything that could go wrong or complicate the implementation
- **Out of scope** — explicitly state what this design does not address

Design documents are permanent artefacts. They serve as the rationale record for future developers who ask "why was this done this way?"

**Naming convention:** `DESIGN_FEATURE_NAME.md` where the feature name uses screaming snake case (e.g., `DESIGN_CSV_TABLE_IMPORT.md`). For known-issue fixes, use `DESIGN_KInn_description.md`.

---

## Step 3 — Plan

Write an implementation plan in `plans/PLAN_FEATURE_NAME.md`.

A plan document covers:

- **Files to change** — specific source files and the changes to be made in each
- **Implementation steps** — ordered list of discrete coding tasks
- **Acceptance criteria** — how you will verify the change is correct
- **Dependencies** — anything that must be done first

The plan pairs with the design. They share the same name suffix (e.g., `DESIGN_CSV_TABLE_IMPORT.md` pairs with `PLAN_CSV_TABLE_IMPORT.md`).

---

## Step 4 — Review

Present the design and plan to the team lead before writing any code. The review confirms:

- The approach is correct and complete
- The implementation steps are feasible
- No scope creep has been introduced
- The acceptance criteria are testable

**Implementation does not start until the review is approved.** If the scope changes during review, update both documents before proceeding.

---

## Step 5 — Implement

Work through the plan steps in order. For each step:

1. Make the change in the relevant `src/` file
2. Verify brace balance: `{` count must equal `}` count in modified files
3. Check for non-ASCII characters — the build will reject them (see `DEVELOPER_ONBOARDING.md`)
4. If you encounter an edge case not covered by the plan, **stop and discuss** rather than silently extending scope

If you deviate from the plan for any reason, document the deviation explicitly in the plan file and raise it with the team lead.

---

## Step 6 — Document

After implementation, before running the build:

### User guide pages

If the change introduces or modifies a user-visible feature (new screen, new workflow, changed label, new field), create or update the relevant guide page(s) in `documentation/user-guide/`.

- Each guide is a standalone HTML page covering one task (e.g., "How to import a master file")
- Guides are text-only — no screenshots, no placeholder image blocks
- Keep the `index.html` table of contents in sync when pages are added or removed

Do not write or update guides for internal refactors or bug fixes that have no user-visible effect.

### APP_TREE.md

Update `APP_TREE.md` after any change that:

- Creates, deletes, or renames a source file
- Adds, removes, or relabels a sidebar item
- Introduces or rewires a form panel
- Renames a component or changes a route string

Move retired files to the Legacy section rather than removing them from the tree.

---

## Step 7 — Build (pre-build sequence)

**The build bundles `CHANGELOG.md` and `KNOWN_ISSUES.md` into the release zip at build time.** Entries added after the build are not in the zip. Always complete these steps before running `python build.py`:

### Pre-build sequence

```bash
# 1. Pre-generate the build ID (run this first — use the exact output)
python -c "import datetime; print(datetime.datetime.now().strftime('build-%Y%m%d-%H%M'))"

# 2. Write the CHANGELOG.md entry using that build ID

# 3. Update SESSION_METRICS.md with the same build ID and time estimates

# 4. Run the build immediately (within the same minute so the ID matches)
cd build
python build.py
```

### CHANGELOG.md format

Add a new entry at the top of the file, above all previous entries:

```
## build-YYYYMMDD-HHMM

### Feature / Enhancement / Fix: <short title>

- <bullet describing the change>
- <bullet describing the change>
```

Use `Feature` for wholly new functionality, `Enhancement` for improvements to existing features, `Fix` for bug fixes.

### SESSION_METRICS.md format

Add a row to the current session table with:

- Build ID
- Discussion time (minutes)
- Design time (minutes)
- Coding time (minutes)
- Testing time (filled in after testing, not before the build)

---

## Step 8 — Test

Open `dist/dq-accelerator.html` directly in Chrome. Test:

1. **The golden path** — the primary workflow for the change works end to end
2. **Edge cases** — empty data, invalid input, retired records, non-master user view
3. **Regressions** — verify that adjacent functionality still works (e.g., if you changed the import screen, also test the export screen)
4. **Console** — open DevTools (F12) and confirm no JavaScript errors

If bugs are found:

- Fix them before the session is considered complete
- Add any that cannot be fixed immediately to `KNOWN_ISSUES.md` with status `open` and a brief description

---

## Summary checklist

Before considering a task complete, verify:

- [ ] Design document written and approved
- [ ] Plan document written and approved
- [ ] Non-ASCII characters absent from all modified JS files
- [ ] `APP_TREE.md` updated (if structure changed)
- [ ] User guide pages created or updated (if user-facing change)
- [ ] `CHANGELOG.md` entry written with the correct build ID
- [ ] `SESSION_METRICS.md` entry written
- [ ] Build ran successfully (`python build.py` exits with `Build OK`)
- [ ] Tested in browser — golden path and edge cases pass, no console errors
- [ ] `KNOWN_ISSUES.md` updated (new issues added, fixed issues marked)
- [ ] Branch committed and PR opened (see `CONTRIBUTING.md`)

---

*DQ Accelerator — Cognizant Technology Consulting for Ministry of Justice*
