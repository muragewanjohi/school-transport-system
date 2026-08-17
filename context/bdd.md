# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Demo account banner and request to go live |
| **Stack** | `nextjs` (`apps/admin_dashboard`) |
| **Owner path(s)** | `apps/admin_dashboard/src/lib/demoGoLive.ts`, `apps/admin_dashboard/src/app/api/demo/go-live/route.ts`, `apps/admin_dashboard/src/lib/demoRequestEmails.ts` |
| **Started** | 2026-08-17 |
| **Status** | `passing` |

## Goal

School admins on a per-lead demo store see that they are on a demo account with an expiry date. **Request to go live** marks the linked demo request `ready_to_onboard` and emails `info@onthebusapp.com`. The demo tenant is not flipped to paid.

## Scenarios

```gherkin
Feature: Demo request to go live

  Scenario: Per-lead confirmed demo can request go live
    Given an is_demo tenant linked to a confirmed demo request
    When go-live eligibility is evaluated
    Then the school can request to go live

  Scenario: Expiry date is formatted for the banner
    Given demo_expires_at is 2026-08-31T00:00:00.000Z
    When the expiry label is formatted on 2026-08-17
    Then it reads Expires 31 August 2026

  Scenario: Request to go live updates status and emails sales
    Given a school admin on a confirmed per-lead demo
    When they POST /api/demo/go-live
    Then demo_requests.status becomes ready_to_onboard
    And an email is sent to info@onthebusapp.com

  Scenario: Repeat request is idempotent
    Given the demo request is already ready_to_onboard
    When they POST /api/demo/go-live again
    Then the API succeeds without sending another email

  Scenario: Play Review and static demo cannot convert
    Given a demo tenant whose slug is play-review or demo
    When go-live eligibility is evaluated
    Then the school cannot request to go live

  Scenario: Paid schools cannot request go live
    Given a tenant with is_demo false
    When they POST /api/demo/go-live
    Then the API returns 400
```

## Automation map

| Scenario | Test |
| :--- | :--- |
| Per-lead confirmed demo can request go live | `apps/admin_dashboard/src/lib/demoGoLive.test.ts` |
| Expiry date is formatted for the banner | `apps/admin_dashboard/src/lib/demoGoLive.test.ts` |
| Request to go live updates status and emails sales | `apps/admin_dashboard/src/app/api/demo/go-live/route.test.ts` |
| Repeat request is idempotent | `apps/admin_dashboard/src/app/api/demo/go-live/route.test.ts` |
| Play Review and static demo cannot convert | `apps/admin_dashboard/src/lib/demoGoLive.test.ts` |
| Paid schools cannot request go live | `apps/admin_dashboard/src/app/api/demo/go-live/route.test.ts` |
