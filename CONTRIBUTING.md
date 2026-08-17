# Contributing

Branching rules, commit conventions, and PR process for the DQ Accelerator.

---

## Branch rules

| Rule | Detail |
|---|---|
| **Never commit directly to `master`** | All changes — code, documentation, designs, plans — must go through a branch and a PR |
| **No branch-from-branch** | Always branch from `master`. Do not create a feature branch off another feature branch |
| **Keep branches short-lived** | A branch should represent one coherent unit of work. Merge back to `master` as soon as it is tested and reviewed |

---

## Branch naming

```
feature/<kebab-case-description>
fix/<issue-id>-<kebab-case-description>
docs/<kebab-case-description>
```

**Examples:**

```
feature/csv-table-import
feature/dashboard-integrity-improvements
fix/ki9-conflict-card-context
docs/developer-onboarding
```

Use `fix/ki<N>-...` when the branch addresses a specific known issue from `KNOWN_ISSUES.md`. Use `feature/` for new functionality. Use `docs/` for documentation-only changes with no build involved.

---

## Commit message format

Match the existing style in the repository:

```
<Type>: <short description> (<build-id>)
```

**Types:**

| Type | Use for |
|---|---|
| `Feature` | Wholly new functionality |
| `Enhancement` | Improvement to an existing feature |
| `Fix` | Bug fix |
| `Docs` | Documentation-only change |
| `Refactor` | Internal restructure with no user-visible effect |
| `Build` | Build script or tooling change |

For commits that combine types, separate with ` + ` (e.g., `Enhancement + Fix:`).

**Examples:**

```
Feature: Single-Table CSV Import (build-20260722-1819)
Fix: move master designation from stewardship sentinel row to localStorage (build-20260722-2024)
Enhancement + Fix: Sidebar — Database Actions group; Stewardship hidden (build-20260722-2038)
Docs + Build: add README.md and EXECUTIVE_SUMMARY.md; include both in distribution zip
```

Include the build ID in any commit that produces a build artefact. For documentation or design/plan commits that do not trigger a build, the build ID can be omitted.

---

## Pull requests

1. Ensure the branch is up to date with `master` before opening the PR
2. The PR title follows the same format as the commit message
3. The PR description should reference:
   - The design document (`designs/DESIGN_FEATURE_NAME.md`) if one exists
   - The plan document (`plans/PLAN_FEATURE_NAME.md`) if one exists
   - Any known issues addressed (e.g., `Closes KI-9`)
4. The PR must include a `CHANGELOG.md` entry
5. All user guide updates must be included in the same PR as the feature change — not in a follow-up PR

Merges to `master` use a merge commit (not squash or rebase) so the branch history is preserved.

---

## What goes on a branch

Everything related to one unit of work goes in the same branch and PR:

- Source code changes (`src/`)
- Design document (`designs/`)
- Plan document (`plans/`)
- User guide updates (`documentation/user-guide/`)
- `APP_TREE.md` update (if structure changed)
- `CHANGELOG.md` entry
- `KNOWN_ISSUES.md` update (if applicable)

Do not open a PR for code without the accompanying documentation, and do not open a separate PR just for documentation that should have been part of the feature PR.

---

*DQ Accelerator — Cognizant Technology Consulting for Ministry of Justice*
