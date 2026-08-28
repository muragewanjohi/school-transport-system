# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Show and restore demo expiry |
| **Stack** | Next.js admin dashboard + Postgres |
| **Owner path(s)** | `apps/admin_dashboard/src/lib/demoGoLive.ts`, `apps/admin_dashboard/src/app/api/demo-requests/route.ts`, `apps/admin_dashboard/src/app/schools/page.tsx`, `apps/admin_dashboard/src/app/schools/demos/[id]/page.tsx` |
| **Started** | 2026-08-28 |
| **Status** | `passing` |

## Goal

Platform admins always see demo expiry on the request table and detail page. The date is stored on `demo_requests` as well as the tenant. If the store was purged, the UI says so and can provision a new store instead of showing a blank dash.

## Scenarios

```gherkin
Feature: Show and restore demo expiry

  Scenario: Live store expiry is visible without a URL-only cell
    Given a confirmed demo request linked to a tenant with demo_expires_at
    When the request is listed or opened
    Then demo_expires_at is returned even if the admin reads the request row
    And the table and detail page show a formatted expiry date

  Scenario: Purged store does not hide the expiry column
    Given a ready_to_onboard request whose provisioned tenant is gone
    When the request is listed or opened
    Then the UI shows that the demo store was removed
    And it does not render an empty dash with no explanation

  Scenario: Re-provision a missing store
    Given a confirmed or ready_to_onboard request with no live tenant
    When a platform admin provisions the store again
    Then a new is_demo tenant is created with a future demo_expires_at
    And the request is linked again
```

## Automation map

| Scenario | Test path | Status |
| :--- | :--- | :--- |
| Live store expiry is visible | `apps/admin_dashboard/src/lib/demoGoLive.test.ts` | passing |
| Purged store does not hide the expiry column | `apps/admin_dashboard/src/lib/demoGoLive.test.ts` | passing |
| Re-provision a missing store | `apps/admin_dashboard/src/app/api/demo-requests/route.test.ts` | passing |
