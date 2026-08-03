# BDD — Current Module

> **Overwrite policy:** This file holds scenarios for **one** active module/feature at a time.  
> When starting a **new** module or feature, **replace the entire contents** of this file (do not append).  
> Historical scenarios live in automated tests and in **Completed** notes in [progress-tracker.md](progress-tracker.md).

---

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Per-school demo stores |
| **Stack** | `next` |
| **Owner path(s)** | `apps/admin_dashboard/src/lib/demoProvision.ts`, `apps/admin_dashboard/src/lib/tenantHost.ts`, `apps/admin_dashboard/src/app/api/demo-requests/route.ts` |
| **Started** | 2026-08-03 |
| **Status** | `passing` |

## Goal

Platform Confirm provisions a time-boxed `{school}-demo.onthebusapp.com` store with geo-shifted slim roster and emails admin + Flutter (request phone) credentials; Complete/expiry purge the store.

## Actors

- Lead requester (e.g. Jane at Nairobi School)
- Platform super admin
- Resend (email)
- Flutter parent / driver apps (phone + OTP)

## Scenarios

### Happy path

```gherkin
Feature: Per-school demo stores

  Scenario: Slug builder › school name › yields Option A demo subdomain slug
    Given a demo request school name "Nairobi School"
    When the demo slug is built
    Then the slug is "nairobi-school-demo"
    And the slug length is at most 48 characters

  Scenario: Phone normalizer › leading zero Kenyan mobile › becomes E.164 +254
    Given a submitted phone "0712345678"
    When the phone is normalized for demo login
    Then the result is "+254712345678"

  Scenario: Phone normalizer › already E.164 › remains stable
    Given a submitted phone "+254712345678"
    When the phone is normalized for demo login
    Then the result is "+254712345678"

  Scenario: Onboarding guard › slug ending in -demo › is blocked for real schools
    Given a candidate onboarding slug "acme-academy-demo"
    When onboarding slug validation runs
    Then the slug is rejected as blocked
    And "demo" alone remains blocked
    And "acme-academy" remains allowed

  Scenario: Default expiry › confirm without custom date › uses 14 days
    Given DEMO_DEFAULT_EXPIRY_DAYS is 14
    When a demo store is confirmed without an explicit expiry override
    Then the default expiry window is 14 days from confirm
```

### Failure / edge

```gherkin
  Scenario: Slug builder › collision attempt index › appends numeric infix before -demo
    Given school name "Nairobi School"
    And attempt index 2
    When the demo slug is built
    Then the slug is "nairobi-school-2-demo"

  Scenario: Slug builder › empty / punctuation-only name › falls back to school-demo
    Given a school name "!!!"
    When the demo slug is built
    Then the slug is "school-demo"

  Scenario: Onboarding guard › reserved apex slug › is blocked
    Given a candidate onboarding slug "www"
    When onboarding slug validation runs
    Then the slug is rejected as blocked
```

## Automation map

| Scenario title | Test file / `describe`/`it` name | Status |
| :--- | :--- | :--- |
| Slug builder › school name › yields Option A demo subdomain slug | `src/lib/demoProvision.test.ts` › `buildDemoSlug › Nairobi School › returns nairobi-school-demo` | `done` |
| Phone normalizer › leading zero Kenyan mobile › becomes E.164 +254 | `src/lib/demoProvision.test.ts` › `normalizeDemoPhone › leading 0 › converts to +254` | `done` |
| Phone normalizer › already E.164 › remains stable | `src/lib/demoProvision.test.ts` › `normalizeDemoPhone › E.164 › unchanged` | `done` |
| Onboarding guard › slug ending in -demo › is blocked for real schools | `src/lib/tenantHost.test.ts` › `isOnboardingBlockedSlug › *-demo and demo › blocked; real slug allowed` | `done` |
| Default expiry › confirm without custom date › uses 14 days | `src/lib/demoProvision.test.ts` › `DEMO_DEFAULT_EXPIRY_DAYS › constant › is 14` | `done` |
| Slug builder › collision attempt index › appends numeric infix before -demo | `src/lib/demoProvision.test.ts` › `buildDemoSlug › attempt 2 › returns nairobi-school-2-demo` | `done` |
| Slug builder › empty / punctuation-only name › falls back to school-demo | `src/lib/demoProvision.test.ts` › `buildDemoSlug › punctuation only › returns school-demo` | `done` |
| Onboarding guard › reserved apex slug › is blocked | `src/lib/tenantHost.test.ts` › `isOnboardingBlockedSlug › www › blocked` | `done` |

## Notes

- Synthetic PII only (`Nairobi School`, `+254712345678`).
- Full `provisionDemoStore` / Resend / purge flows need mocked Supabase + HTTP — tracked as follow-up; pure helpers and onboarding guards covered in this pass.
- Run: `npm test` in `apps/admin_dashboard`.
