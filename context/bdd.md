# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Demo request inbox badge |
| **Stack** | Next.js admin dashboard |
| **Owner path(s)** | `apps/admin_dashboard/src/lib/demoGoLive.ts`, `apps/admin_dashboard/src/app/api/demo-requests/route.ts`, `apps/admin_dashboard/src/components/Sidebar.tsx`, `apps/admin_dashboard/src/app/schools/page.tsx` |
| **Started** | 2026-08-28 |
| **Status** | `passing` |

## Goal

The red Demo Requests notification counts unreviewed (`pending`) leads only. Confirming / approving a demo clears the badge. `ready_to_onboard` stays visible in the inbox copy but does not badge.

## Scenarios

```gherkin
Feature: Demo request inbox badge

  Scenario: Pending leads still badge
    Given one pending demo request and one ready_to_onboard request
    When the platform summary is loaded
    Then attention_count is 1
    And pending_count is 1
    And ready_to_onboard_count is 1

  Scenario: Approved demo does not badge
    Given only ready_to_onboard or confirmed demo requests
    When the platform summary is loaded
    Then attention_count is 0
    And the sidebar and Demo Requests tab badges are hidden
```

## Automation map

| Scenario | Test path | Status |
| :--- | :--- | :--- |
| Pending leads still badge | `apps/admin_dashboard/src/lib/demoGoLive.test.ts`, `apps/admin_dashboard/src/app/api/demo-requests/route.test.ts` | passing |
| Approved demo does not badge | `apps/admin_dashboard/src/lib/demoGoLive.test.ts`, `apps/admin_dashboard/src/app/api/demo-requests/route.test.ts` | passing |
