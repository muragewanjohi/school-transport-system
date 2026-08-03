# BDD — Current Module

> **Overwrite policy:** This file holds scenarios for **one** active module/feature at a time.  
> When starting a **new** module or feature, **replace the entire contents** of this file (do not append).  
> Historical scenarios live in automated tests and in **Completed** notes in [progress-tracker.md](progress-tracker.md).

---

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Interactive journey step preview |
| **Stack** | `next` |
| **Owner path(s)** | `apps/admin_dashboard/src/app/page.tsx`, `apps/admin_dashboard/src/app/globals.css`, `apps/admin_dashboard/public/stitch/journey/` |
| **Started** | 2026-08-03 |
| **Status** | `passing` |

## Goal

Visitors can hover, focus, or tap any “How it works” step and immediately see a polished visual and concise explanation of that stage.

## Actors

- Prospective school administrator
- Parent or driver comparing the product
- Keyboard, touch, and reduced-motion users

## Scenarios

### Happy path

```gherkin
Feature: Interactive journey step preview

  Scenario: Desktop visitor › hovers a step › corresponding preview appears
    Given the seven journey steps are visible
    When the visitor hovers "Parents Receive Alerts"
    Then step 4 becomes visually active
    And the parent alert image, title, and description appear below the timeline

  Scenario: Keyboard visitor › focuses a step › corresponding preview appears
    Given focus is on a journey step button
    When the visitor moves focus to "Students Board the Bus"
    Then step 5 becomes active
    And the preview region announces the new title and description

  Scenario: Touch visitor › taps a mobile step › inline preview expands
    Given the mobile journey list is visible
    When the visitor taps "Trip Complete"
    Then the trip-complete image and description appear with that step
```

### Failure / edge

```gherkin
  Scenario: Pointer leaves timeline › active preview › remains stable
    Given the visitor selected step 3
    When the pointer leaves the step
    Then step 3 remains active
    And the preview does not disappear or cause layout shift

  Scenario: Reduced-motion visitor › changes steps › content switches without motion
    Given prefers-reduced-motion is enabled
    When the visitor selects another step
    Then the correct content appears
    And decorative transitions are disabled
```

## Automation map

| Scenario title | Test / verification | Status |
| :--- | :--- | :--- |
| Desktop hover shows corresponding preview | Browser hover verified `aria-selected=true`; heading changed to “One live source of truth” | `done` |
| Keyboard focus changes preview | Desktop tabs are focusable with `onFocus`; accessibility snapshot verifies tab semantics | `done` |
| Mobile tap expands preview | 390×844 browser test; “Trip Complete” changed to `expanded` and showed “Closed out safely” | `done` |
| Pointer leave keeps preview stable | State changes only on enter/focus/click; no `onMouseLeave` reset | `done` |
| Reduced motion disables transitions | `prefers-reduced-motion` disables preview, image, icon, and arrow animation; production build passed | `done` |

## Notes

- Preview images contain no real PII.
- Generated imagery follows the OnTheBus navy + emerald visual system.
- The interaction must be progressive: step labels remain understandable if imagery fails.
- Verification: `npm test` (11 passed), `npm run build` (passed), browser desktop/mobile interaction checks (passed).
