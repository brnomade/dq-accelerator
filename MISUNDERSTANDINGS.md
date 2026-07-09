# MISUNDERSTANDINGS.md

A catalogue of incidents where AI-assisted development produced the wrong output due to misinterpretation, assumption, or failure to ask for clarification. Intended as lessons learned for practitioners working with AI coding assistants.

Each entry records: the context, what went wrong, the cost in time and rework, and the conclusion drawn.

---

## Incident 001 — 2026-06-19

### Context

**Feature:** KI-22 — Rule dropdown in the Add Allocation panel grows too long as rule volumes increase.

**Specification given:** Filter the rule dropdown to show: (a) all rules with the prefix `Generic -` (always visible), and (b) rules whose name follows the pattern `CDS_NAME - Rule Name`, where `CDS_NAME` matches the currently selected Critical Data Set. All other rules should be hidden.

---

### What went wrong

**Problem 1 — Wrong file.**
The Add Allocation panel exists in two places: `130_view_rule_allocation.js` (the standalone Rule Allocation table, reached via a different menu item) and `141_view_cde_list.js` (the Data and Stewardship page, which is where the user reported the issue). The AI edited the wrong file first without verifying which screen the user was referring to. The user had to report that no change was visible before the correct file was identified.

**Problem 2 — Incorrect filter logic.**
When the fix was applied to the correct file, the filtering logic was wrong. Instead of implementing the stated rule literally (`Generic -` prefix = always show; `CDS_NAME -` prefix = show only when that CDS is selected; anything else = hide), the AI introduced an additional lookup: a set of all known CDS names (`allCdsNames`) was built from the database, and any rule whose prefix was *not* found in that set was also treated as generic. This caused rules named `"OtherCDS - something"` to pass through as generic, because their prefix happened not to match any CDS name in the database exactly. The result: 99 of 100 rules were still visible when only a handful were expected.

**Root cause of Problem 2:** The AI substituted its own interpretation ("a rule is generic if its prefix isn't a known CDS name") for the explicit instruction ("a rule is generic if its prefix is `Generic`"). The deviation was not flagged before coding.

---

### Cost

| Phase | Estimated time |
|-------|---------------|
| User reports no visible change; AI explains preconditions | 5 min |
| User identifies wrong file; AI applies fix to correct file | 5 min |
| User reports filter still not working (99 of 100 showing) | 5 min |
| AI diagnoses and corrects the logic | 5 min |
| User questions why literal spec was not followed; discussion | 10 min |
| **Total user time lost** | **~30 min** |

Three separate builds were required (1634, 1646, 1651) to reach a correct result that should have been delivered in one.

---

### Conclusion

1. **Implement explicit logic literally.** When a user states a precise rule or algorithm, implement it word for word. Do not add intermediate lookups, generalisations, or "robustness" measures that were not requested. The spec was unambiguous: `Generic -` prefix is always shown; everything else with a ` - ` prefix is hidden unless the prefix matches the current CDS. There was nothing to interpret.

2. **Verify the correct component before editing.** Before touching any file, confirm which screen the user is referring to and trace the navigation path to the exact component. A 30-second grep for the menu label in the sidebar would have identified `141_view_cde_list.js` immediately.

3. **Flag deviations before coding, not after testing.** If the AI identifies an edge case or a reason to go beyond the stated spec, it must say so explicitly before writing any code. Silent substitution of a different interpretation is not acceptable and is harder to debug than a simple wrong answer.

4. **CLAUDE.md updated** to capture rule 1 and 3 as standing project instructions, with a concrete example drawn from this incident.

---

## Incident 002 — 2026-07-01

### Context

**Feature:** Reset data — two-stage confirmation when unsaved delta changes exist.

**User's request:** When the user clicks Reset data, detect whether a delta export has been done and, if not, ask them to confirm again that they are willing to lose their changes.

---

### What went wrong

**Problem — AI proposed new infrastructure that already existed.**

The AI's first suggestion was to introduce a `lastExportedAt` timestamp: new app state, a new `markExported()` context callback, and a call to that callback in every export handler in `230_screen_export.js`. This would have required changes to at least three files and added ongoing maintenance surface.

The project already has `buildDelta(data, snapshot)` — a function that computes the exact set of pending changes by comparing current data against the base snapshot. The export screen uses it every time it produces a delta file. Calling it at reset time gives the count of pending changes directly, with no new state and no new wiring.

The user had to redirect with: *"Aren't we tracking changes somewhere else already? We do that to produce the delta file. Why can't we use the same flags from there?"*

Only then did the AI re-explore the codebase, find `buildDelta`, and revise the proposal.

**Root cause:** The AI treated the task as a greenfield problem and designed a new solution without first auditing what the project already provided. The connection between "detect pending changes" and "the delta computation mechanism" should have been made immediately, given that both concepts are present in the same codebase.

The user's expectation was reasonable: a practitioner with project knowledge would have asked "how does the delta export know there are changes?" before proposing anything new.

---

### Cost

| Phase | Estimated time |
|-------|---------------|
| AI presents wrong proposal (timestamp-based) | 3 min |
| User redirects; AI re-explores codebase | 5 min |
| AI presents corrected proposal; user approves | 3 min |
| **Total user time lost** | **~11 min** |

One extra round-trip and a needlessly complex first proposal.

---

### Conclusion

1. **Audit existing mechanisms before proposing new ones.** When a feature requires detecting state that is already computed elsewhere (e.g. "are there pending changes?"), search the codebase for that computation first. In this project, anything related to delta tracking lives in `71_master_version.js` and `230_screen_export.js`.

2. **Long-term memory gap.** The AI had no recollection of `buildDelta` from previous sessions. The user knew it existed and expected the AI to connect the dots without being told. Memory of architectural building blocks — not just file names — needs to be retained across sessions.

3. **Prompt completeness is a shared responsibility.** The user's prompt did not mention the existing delta mechanism, assuming the AI would know. In practice, the more project-specific the task, the more the user may need to name the relevant components explicitly — or the AI must do a broader exploration pass before proposing solutions.

4. **Reference memory entry added** for key delta utility functions so future sessions can locate them without re-exploration.

---
