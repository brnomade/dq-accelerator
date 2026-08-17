# Welcome to the DQ Accelerator

Welcome to the team. This document is your entry point for the handover — it gives you context on the project, a map of the documentation pack, and a suggested path through the first week.

---

## The project in brief

The DQ Accelerator is a browser-based metadata management tool built by Cognizant for the Ministry of Justice (MoJ) Data Management practice. It gives data stewards a structured front-end for managing Critical Data Elements (CDEs), data quality rules, organisational accountability, field profiling, and quality scoring.

The application is a proof-of-concept delivered as a single self-contained HTML file — no server, no installation, no IT infrastructure required. It runs in any modern browser and is hosted on SharePoint. This constraint was deliberate: it makes the tool immediately deployable within MoJ's environment without waiting on IT.

Under the hood it uses React 18 and Babel standalone loaded from CDN, with localStorage as its data layer. A multi-user delta sync model allows data stewards to work on local copies and contribute changes back to a designated master via JSON delta files.

For the full picture, read `EXECUTIVE_SUMMARY.md` followed by `README.md`.

---

## Your handover pack

Everything you need is in this repository. The table below lists all key documents, grouped by purpose.

### Orientation

| Document | What it covers |
|---|---|
| `WELCOME.md` *(this file)* | Entry point and pack overview |
| `EXECUTIVE_SUMMARY.md` | Project purpose, users, and architectural rationale (5 min read) |
| `README.md` | Full technical architecture: stack, data model, SCHEMA-driven design, delta sync, permission model (20 min read) |

### Developer workflow

| Document | What it covers |
|---|---|
| `DEVELOPER_ONBOARDING.md` | First-day guide: curated reading order, environment setup, how to make and test your first change, non-negotiable technical rules |
| `WAYS_OF_WORKING.md` | The development process: Design → Plan → Review → Implement → Document → Build → Test |
| `CONTRIBUTING.md` | Branching rules, commit message format, PR process |

### Codebase navigation

| Document | What it covers |
|---|---|
| `APP_TREE.md` | Every screen, sidebar item, form panel, and source file — your navigation map |
| `src/10_constants.js` | The `SCHEMA` object — single source of truth for all 22 tables |

### Project state

| Document | What it covers |
|---|---|
| `BACKLOG.md` | Phase roadmap and task status |
| `KNOWN_ISSUES.md` | All tracked bugs with status (open / investigating / fixed / deferred) |
| `CHANGELOG.md` | Full build history with feature descriptions |

### Feature-level detail

| Location | What it covers |
|---|---|
| `designs/` | Design documents for every feature (29 files) — why each feature was built the way it was |
| `plans/` | Implementation plans paired to each design (28 files) — how each feature was built |

### End-user reference

| Location | What it covers |
|---|---|
| `documentation/user-guide/` | 50 task-focused HTML guide pages covering every workflow in the application |

### Requirements

| Document | What it covers |
|---|---|
| `documentation/DQ_ACCELERATOR_REQUIREMENTS_v0.2.md` | MoSCoW-prioritised requirements specification |

---

## Suggested start

### Day 1 — Orientation

1. Read `EXECUTIVE_SUMMARY.md` — understand what this is and why it was built this way
2. Read `README.md` — understand the architecture end to end
3. Open `dist/dq-accelerator.html` in Chrome and spend 30 minutes using the application as a steward would

### Day 2 — Developer setup

1. Read `DEVELOPER_ONBOARDING.md` in full
2. Read `WAYS_OF_WORKING.md` and `CONTRIBUTING.md`
3. Make a trivial change in `src/`, run `python build.py`, and verify the output — close the loop on the build process

### Week 1 — Codebase familiarisation

1. Read `APP_TREE.md` — know where every screen and panel lives
2. Browse `KNOWN_ISSUES.md` — understand the open bugs before touching anything
3. Read `BACKLOG.md` — understand the current phase and what is queued
4. Browse `src/` files in numeric order (00 → 240) to build a mental model of the codebase
5. Read two or three `designs/` + `plans/` pairs for recently completed features (e.g., `DESIGN_CSV_TABLE_IMPORT.md` + `PLAN_CSV_TABLE_IMPORT.md`) to understand how features are designed and documented

---

## Where we are

### Completed

| Phase | Description |
|---|---|
| Phase 1 | Core application: all 22 tables, SCHEMA-driven views, form panels, sidebar, export/import, RAG simulator, field profiling, DDL library |
| Phase 1.5 | Multi-user delta sync: PK namespace, delta export, delta import with PK/FK remap, conflict resolution UI, access gates |
| Phase 1.6 | Business Rule Assistant: AI-assisted rule generation via clipboard, CDE context builder, prompt renderer, paste-and-parse, proposal review cards, record creation |

### In progress and next

The immediate queue is in `BACKLOG.md`. The open items in `KNOWN_ISSUES.md` are the most likely source of first tasks — review them and discuss prioritisation with the team lead before picking anything up.

### Phase 2 (planned, not started)

Replace localStorage with SharePoint Lists via Microsoft Graph API and MSAL.js. `README.md` has a section on the planned architecture. No design or requirements exist yet for Phase 2 — this will be a significant scoping exercise.

---

## Key contacts and access

| Role | Name | Contact |
|---|---|---|
| Team lead / project owner | Andre Ballista | andre.ballista@cognizant.com |
| MoJ engagement contact | *[To be confirmed]* | *[To be confirmed]* |

### Access you will need

| System | Notes |
|---|---|
| Git repository | This repository — request access from the team lead |
| SharePoint (MoJ) | Where the application is hosted for end users — request access from the team lead |
| MoJ test environment | For user acceptance testing with real stewards — access arrangements TBC |

---

## A note on AI-assisted development

This codebase was built using Claude Code (Anthropic's AI development tool) as a pair-programmer throughout. You will find a `CLAUDE.md` file at project root — this contains instructions for Claude, not for you, though it is worth reading as it documents many of the same constraints covered in `DEVELOPER_ONBOARDING.md`. The design and plan discipline described in `WAYS_OF_WORKING.md` emerged from this working style and should be followed regardless of whether you use AI tooling.

---

*DQ Accelerator — Cognizant Technology Consulting for Ministry of Justice*
*Handover pack prepared: August 2026*
