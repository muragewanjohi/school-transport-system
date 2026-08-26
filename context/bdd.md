# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Email OTP fallback for login |
| **Stack** | Next.js + Flutter |
| **Owner path(s)** | `apps/admin_dashboard/src/lib/issuePhoneOtp.ts`, `apps/admin_dashboard/src/lib/resendEmail.ts`, `apps/admin_dashboard/src/lib/ensureParentProfiles.ts`, `apps/admin_dashboard/src/app/api/auth/parent-request-otp/route.ts`, `apps/admin_dashboard/src/app/api/auth/driver-request-otp/route.ts`, parent/driver login screens |
| **Started** | 2026-08-26 |
| **Status** | `passing` |

## Goal

When Africa's Talking rejects a login OTP SMS (e.g. `UserInBlacklist`), the same OTP is delivered by Resend email if the profile has a real email. Phone remains the account key. Guardians must supply email so parent profiles can be upserted on student save. Explicit `channel: "email"` resend is supported. No push OTP for first login.

## Scenarios

```gherkin
Feature: Email OTP fallback for login

  Scenario: SMS success unchanged
    Given a registered parent or driver with a live AT username in production
    When they request an OTP without channel email
    And Africa's Talking accepts the SMS
    Then the response source is sms
    And Resend is not called
    And sandbox_otp is omitted

  Scenario: SMS rejection falls back to email
    Given a registered profile with a real email
    When they request an OTP
    And Africa's Talking rejects with UserInBlacklist
    Then the same OTP is emailed via Resend
    And the response source is email
    And email_hint is a masked address
    And the full email and OTP are not returned or logged

  Scenario: SMS rejection with no email
    Given a registered profile without a usable email
    When Africa's Talking rejects the SMS
    Then the API returns 502 with the SMS failure detail
    And Resend is not called

  Scenario: Explicit email channel
    Given a registered profile with a real email
    When they request an OTP with channel email
    Then Resend sends the OTP
    And Africa's Talking is not called
    And source is email with email_hint

  Scenario: Explicit email without address
    Given a registered profile without a usable email
    When they request an OTP with channel email
    Then the API returns 422
    And neither SMS nor Resend is sent

  Scenario: Play Review and dry-run unchanged
    Given play-review or SMS dry-run delivery
    When they request an OTP
    Then existing play_review / sandbox_otp behavior applies
    And Resend is not used for the OTP

  Scenario: Guardian email required and parent profile upserted
    Given a school admin saves a student with guardians
    When each guardian has name, phone, and email
    Then guardian validation rejects missing email
    And a parent profile is inserted or updated for each guardian phone in the tenant
```

## Automation map

| Scenario | Test path | Status |
| :--- | :--- | :--- |
| SMS success | `apps/admin_dashboard/src/lib/issuePhoneOtp.test.ts` | passing |
| SMS → email fallback | `apps/admin_dashboard/src/lib/issuePhoneOtp.test.ts` | passing |
| SMS fail, no email | `apps/admin_dashboard/src/lib/issuePhoneOtp.test.ts` | passing |
| channel email | `apps/admin_dashboard/src/lib/issuePhoneOtp.test.ts` | passing |
| Play Review / dry-run | `apps/admin_dashboard/src/lib/issuePhoneOtp.test.ts` | passing |
| Guardian email + upsert | `apps/admin_dashboard/src/lib/studentGuardians.test.ts`, `apps/admin_dashboard/src/lib/ensureParentProfiles.test.ts` | passing |
| Mobile email hint / send via email | `apps/parent_app/test/parent_login_test.dart` | passing |
