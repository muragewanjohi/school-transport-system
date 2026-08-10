# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Demo confirm access email |
| **Stack** | `next` |
| **Owner path(s)** | `apps/admin_dashboard/src/app/api/demo-requests/route.ts`, `apps/admin_dashboard/src/lib/demoRequestEmails.ts` |
| **Started** | 2026-08-10 |
| **Status** | `passing` |

## Goal

When a platform admin confirms a demo request, the lead’s work email receives demo store access details (URL, admin password, Flutter phone + OTP). Confirmed stores can resend access details (admin password is reset; OTP reused).

## Actors

- Platform `super_admin`
- Demo lead (requester)

## Scenarios

```gherkin
Feature: Demo confirm access email

  Scenario: Pending request › confirmed › requester receives access email
    Given a pending demo request with a work email
    When a platform admin confirms and provisions the demo store
    Then Resend emails the lead’s work email (not the synthetic admin address)
    And the message includes school URL, admin password, Flutter phone, and OTP

  Scenario: Confirmed store › resend access email › requester receives new password
    Given a confirmed demo request with a provisioned tenant
    When a platform admin chooses Resend access email
    Then the demo admin password is reset
    And Resend emails the lead’s work email with the new password and existing OTP
```

## Automation map

| Scenario title | Test / verification | Status |
| :--- | :--- | :--- |
| Confirm emails requester | `apps/admin_dashboard/src/app/api/demo-requests/route.test.ts` | `passing` |
| Resend emails requester | `apps/admin_dashboard/src/app/api/demo-requests/route.test.ts` | `passing` |

## Notes

- Hosts that run Confirm need `RESEND_API_KEY` and a verified `DEMO_REQUESTS_FROM_EMAIL` (local `.env.local` and Vercel).
- Admin passwords are never stored after provision; resend always resets the password.
