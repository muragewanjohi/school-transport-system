# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Parent trip-start notifications & inbox clear |
| **Stack** | Postgres + Next.js + Flutter |
| **Owner path(s)** | `supabase/migrations/20260821120000_fix_parent_trip_start_and_push_webhook.sql`, `supabase/functions/send-push/index.ts`, `apps/admin_dashboard/src/app/api/parent/notifications/route.ts`, `apps/parent_app/lib/services/parent_notifications_service.dart`, `apps/parent_app/lib/screens/notifications_screen.dart` |
| **Started** | 2026-08-21 |
| **Status** | `passing` |

## Goal

Parents get an in-app/push alert as soon as a trip becomes `in_progress` (when school config allows). Lock-screen push fires without the app being open. Clear All removes inbox rows instead of only marking them read.

## Scenarios

```gherkin
Feature: Parent trip-start and inbox clear

  Scenario: Trip start inserts parent notifications immediately
    Given a scheduled trip for a route with parents
    And tenant_configs.notify_on_trip_start is true
    When the trip status changes to in_progress
    Then each parent receives a notifications row with notification_type trip_start

  Scenario: Push webhook uses pg_net http_post
    Given a notifications row is inserted
    When trigger_push_webhook runs
    Then it calls net.http_post (not extensions.net_http_post)

  Scenario: Clear All deletes inbox rows
    Given a parent has unread notifications
    When the parent confirms Clear All
    Then DELETE /api/parent/notifications removes their rows
    And the inbox UI shows the empty state

  Scenario: Clear All failure keeps the list
    Given the clear API returns an error
    When the parent confirms Clear All
    Then the list is unchanged and an error snackbar is shown
```

## Automation map

| Scenario | Test path | Status |
| :--- | :--- | :--- |
| Clear All deletes inbox rows | `apps/parent_app/test/notifications_screen_test.dart` | passing |
| Clear All failure keeps the list | `apps/parent_app/test/notifications_screen_test.dart` | passing |
| DELETE /api/parent/notifications scoped | `apps/admin_dashboard/src/app/api/parent/notifications/route.test.ts` | passing |
| Push webhook uses pg_net http_post | live DB verify (`net.http_post` + smoke insert → 200) | passing |
| Trip start inserts parent notifications | live DB function def contains `trip_start` | passing |
