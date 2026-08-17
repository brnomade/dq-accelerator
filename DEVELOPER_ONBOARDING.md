# Developer Onboarding Guide

Welcome to the DQ Accelerator. This guide is your starting point — it tells you what to read, in what order, and how to make and test your first change.

---

## What is this project?

A browser-only single-page application for managing Data Quality metadata for the Ministry of Justice (MoJ). It runs entirely from a single self-contained HTML file (`dist/dq-accelerator.html`) with no server, no npm, and no deployment infrastructure. Read `EXECUTIVE_SUMMARY.md` for the two-minute overview, then `README.md` for the full architecture picture.

---

## Prerequisites

You need three things:

| Tool | Notes |
|---|---|
| **Python 3** (any recent version) | Used by the build script only; no packages required beyond stdlib |
| **A modern browser** | Chrome recommended; open `dist/dq-accelerator.html` directly via `file://` |
| **Git** | Feature-branch workflow — see `CONTRIBUTING.md` |

No Node.js, no npm, no package managers, no database, no server. That is intentional.

---

## Curated reading order

Work through these in sequence. Each one takes 5–20 minutes. Skip nothing in this list.

| # | Document | What you will learn | Time |
|---|---|---|---|
| 1 | `EXECUTIVE_SUMMARY.md` | Project purpose, users, and the single-file constraint | 5 min |
| 2 | `README.md` | Full architecture: tech stack, data model, SCHEMA-driven design, delta sync, permissions | 20 min |
| 3 | `APP_TREE.md` | Every screen, sidebar item, form panel, and source file — your navigation map | 10 min |
| 4 | `WAYS_OF_WORKING.md` | The development workflow you are expected to follow | 10 min |
| 5 | `CONTRIBUTING.md` | Branching rules, commit format, PR process | 5 min |
| 6 | `BACKLOG.md` | Current phase status and what is in the queue | 5 min |
| 7 | `KNOWN_ISSUES.md` | Open bugs — read these before you touch anything, to avoid chasing pre-existing problems | 10 min |

After that, spend 20–30 minutes browsing `src/` files in numeric order (00 → 240). You don't need to understand every line — you're building a mental map of what lives where.

---

## Make and test your first change

This is the complete loop from change to verified output.

### 1. Create a branch

```bash
git checkout -b feature/my-first-change
```

### 2. Edit a source file

All application source lives in `src/`. Files are named `NN_description.js` — the number controls load order. Start with something low-risk, like changing a label in `10_constants.js`.

### 3. Pre-generate the build ID

```bash
python -c "import datetime; print(datetime.datetime.now().strftime('build-%Y%m%d-%H%M'))"
```

Write the `CHANGELOG.md` entry using this ID **before** running the build — the build bundles the changelog into the zip at build time, so entries added after are absent from the zip. See `WAYS_OF_WORKING.md` for the full pre-build sequence.

### 4. Run the build

```bash
cd build
python build.py
```

Output: `dist/dq-accelerator.html` (the runnable app) and a zip archive under `dist/`.

### 5. Test in the browser

Open `dist/dq-accelerator.html` directly in Chrome. No server needed. Open DevTools (F12) and check the Console tab — any JavaScript errors will appear there.

---

## Non-negotiable technical rules

These will cause hard build failures or silent runtime bugs if violated. Memorise them.

### No non-ASCII characters in JS files

The build uses Babel standalone loaded from CDN. It rejects any character outside ASCII. The build script validates this and exits with an error listing the offending lines.

Use `\uXXXX` escape sequences inside JS string literals:

```js
// Wrong — build will fail
const label = 'Data — Quality';

// Right
const label = 'Data — Quality';
```

### Special characters in JSX text must be wrapped in a JS expression

`\uXXXX` escapes only work inside JS string literals, **not** directly in JSX text nodes. Wrap them:

```jsx
// Wrong — renders the literal string — in the browser
<span>No conflicts — all clear</span>

// Right
<span>No conflicts {'—'} all clear</span>
```

This applies to every non-ASCII character: em dashes, arrows, bullets, checkmarks, etc.

### All components must be top-level named functions

No anonymous default exports, no components defined inside other components. Babel standalone has scoping issues with nested function components.

```js
// Wrong
function ParentComponent() {
  const Child = () => <div>...</div>;  // Do not do this
  return <Child />;
}

// Right — define Child at the top level of the file
function ChildComponent() {
  return <div>...</div>;
}

function ParentComponent() {
  return <ChildComponent />;
}
```

### Load order is significant

There is no module system — every name is a global. A file at number `N` can only reference functions and variables defined in files numbered below `N`. If you add a new file, pick a number that places it after all its dependencies.

### No ES module syntax

No `import` or `export` statements. Everything runs in a single `<script type="text/babel">` block assembled by the build script.

---

## Quick reference

| Question | Where to look |
|---|---|
| Where is screen X? | `APP_TREE.md` → Sidebar navigation table |
| Where is form panel Y? | `APP_TREE.md` → Form panels catalogue |
| What fields does table Z have? | `src/10_constants.js` → `SCHEMA` object |
| What has changed in recent builds? | `CHANGELOG.md` |
| What bugs are open? | `KNOWN_ISSUES.md` |
| What is left to build? | `BACKLOG.md` |
| How do I add a new screen? | Follow the `NN_screen_name.js` naming pattern; wire the route in `240_app.js`; add a sidebar entry in `80_sidebar.js`; update `APP_TREE.md` |
| How do I add a new table? | Add an entry to `SCHEMA` in `10_constants.js`; the generic view renders it automatically |

---

*DQ Accelerator — Cognizant Technology Consulting for Ministry of Justice*
