# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Parent Supabase Auth JWT |
| **Stack** | `nextjs` (parent-login) + `supabase` (RLS helpers / stops policy) + `flutter` (parent app) |
| **Owner path(s)** | `apps/admin_dashboard/src/lib/parentAuthSession.ts`, `apps/admin_dashboard/src/app/api/auth/parent-login/route.ts`, `supabase/migrations/20260810180000_parent_auth_jwt_rls.sql`, `apps/parent_app/lib/screens/login_screen.dart`, `apps/parent_app/lib/main.dart` |
| **Started** | 2026-08-10 |
| **Status** | `passing` |

## Goal

After phone OTP login, parents receive a real Supabase Auth session (`access_token` / `refresh_token`) whose `sub` equals `profiles.id` and whose claims carry `role=parent` + `tenant_id`, so Realtime RLS on `live_coordinates` / `trip_stop_etas` (and SELECT on `stops`) works. The existing `par.*` HMAC token remains for `/api/parent/etas`.

## Scenarios

```gherkin
Feature: Parent Supabase Auth JWT

  Scenario: Parent login › valid OTP › session includes supabase tokens
    Given a parent profile with a valid OTP
    When POST /api/auth/parent-login succeeds
    Then the JSON session includes access_token (par.*)
    And supabase_access_token and supabase_refresh_token are present

  Scenario: Ensure auth user › profile id reused
    Given parent profile id P with tenant T
    When ensureParentAuthSession runs
    Then an auth.users row exists with id = P
    And app_metadata / user_metadata include role=parent and tenant_id=T

  Scenario: Flutter login › setSession › Realtime client is authenticated
    Given login response includes supabase_refresh_token
    When the parent app completes login
    Then Supabase.auth.currentSession is non-null
    And auth.uid() matches the parent profile id

  Scenario: Parents can read stops on their child's route
    Given an authenticated parent JWT
    When selecting stops for a child's route_id
    Then RLS allows the rows
```

## Automation map

| Scenario title | Test / verification | Status |
| :--- | :--- | :--- |
| Login returns supabase tokens | `parentAuthSession.test.ts` + parent-login `withSupabaseAuth` | `passing` |
| Ensure auth user | `parentAuthSession.test.ts` | `passing` |
| Flutter setSession | `login_screen.dart` + `signOut` on logout | `passing` (code path) |
| Stops RLS | `20260810180000_parent_auth_jwt_rls.sql` applied via MCP | `passing` |

## Notes

- Synthetic email: `parent+{profileId}@users.onthebusapp.internal` (not used for mail).
- JWT claim helpers prefer `app_metadata` then `user_metadata` (parents set both; school admins keep working via user_metadata).
- `par.*` ETA API polling remains as a resilient fallback.
