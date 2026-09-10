# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Mobile session recovery after idle |
| **Stack** | Flutter parent + driver apps, Next.js `/api/auth/parent-refresh` and `/api/auth/driver-refresh` |
| **Owner path(s)** | `apps/admin_dashboard/src/lib/parentSession.ts`, `apps/admin_dashboard/src/lib/driverSession.ts`, `apps/admin_dashboard/src/app/api/auth/parent-refresh/route.ts`, `apps/admin_dashboard/src/app/api/auth/driver-refresh/route.ts`, `apps/parent_app/lib/utils/session_recovery_logic.dart`, `apps/driver_app/lib/utils/session_recovery_logic.dart` |
| **Started** | 2026-09-10 |
| **Status** | `passing` |

## Goal

After the apps sit unused (days), Home/map/inbox must reload current data on open or Refresh without forcing logout. HMAC `par.*` / `drv.*` tokens are re-issued from a still-signed token (including recently expired), and the parent app refreshes or bootstraps the Supabase Auth JWT used for map RLS and Realtime.

## Scenarios

```gherkin
Feature: Mobile session recovery after idle

  Scenario: Expired but signed parent HMAC can be refreshed within grace
    Given a parent HMAC whose exp is in the past but within 30 days
    When POST /api/auth/parent-refresh is called with that Bearer token
    Then 200 is returned with a new par.* access_token

  Scenario: Parent HMAC beyond grace is rejected
    Given a parent HMAC expired more than 30 days ago
    When POST /api/auth/parent-refresh is called
    Then 401 Unauthorized is returned

  Scenario: Expired but signed driver HMAC can be refreshed within grace
    Given a driver HMAC whose exp is in the past but within 30 days
    When POST /api/auth/driver-refresh is called with that Bearer token
    Then 200 is returned with a new drv.* access_token

  Scenario: HMAC should refresh when less than 24 hours remain
    Given a stored HMAC expiring in under 24 hours
    When the app decides whether to call the refresh route
    Then it refreshes before fetching trips, map, or notifications

  Scenario: HTTP 401 retries once after a successful refresh
    Given an API call returned 401 and the session has not been refreshed yet
    When session recovery runs
    Then the client retries the request once with the new token
```

## Automation map

| Scenario | Test path | Status |
| :--- | :--- | :--- |
| Expired but signed parent HMAC can be refreshed within grace | `apps/admin_dashboard/src/app/api/auth/parent-refresh/route.test.ts` | passing |
| Parent HMAC beyond grace is rejected | `apps/admin_dashboard/src/app/api/auth/parent-refresh/route.test.ts` | passing |
| Expired but signed driver HMAC can be refreshed within grace | `apps/admin_dashboard/src/app/api/auth/driver-refresh/route.test.ts` | passing |
| HMAC should refresh when less than 24 hours remain | `apps/parent_app/test/session_recovery_logic_test.dart`, `apps/driver_app/test/session_recovery_logic_test.dart` | passing |
| HTTP 401 retries once after a successful refresh | `apps/parent_app/test/session_recovery_logic_test.dart`, `apps/driver_app/test/session_recovery_logic_test.dart` | passing |
