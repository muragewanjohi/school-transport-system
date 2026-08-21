# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Live Africa's Talking OTP SMS |
| **Stack** | Next.js + Deno Edge Function |
| **Owner path(s)** | `apps/admin_dashboard/src/lib/africasTalkingSms.ts`, `apps/admin_dashboard/src/app/api/auth/driver-request-otp/route.ts`, `apps/admin_dashboard/src/app/api/auth/parent-request-otp/route.ts`, `supabase/functions/send-sms/index.ts` |
| **Started** | 2026-08-21 |
| **Status** | `passing` |

## Goal

Production login OTPs for paid and demo tenants are delivered through the Africa's Talking **live** API. Sandbox host/username is not used in production. Operational trip SMS stays dry-run on demo tenants. Play Review keeps OTP `123456` with no SMS.

## Scenarios

```gherkin
Feature: Live Africa's Talking OTP SMS

  Scenario: Production live credentials send OTP SMS without echoing the code
    Given AFRICASTALKING_USERNAME is the live app username
    And NODE_ENV is production and OTP_SMS_DRY_RUN is not true
    And the phone belongs to a registered parent or driver on a non-play-review tenant
    When they request an OTP
    Then the live AT messaging host is called
    And the response does not include sandbox_otp

  Scenario: Sandbox username or non-production env dry-runs
    Given AFRICASTALKING_USERNAME is sandbox, or NODE_ENV is not production, or OTP_SMS_DRY_RUN is true
    When they request an OTP
    Then Africa's Talking is not called
    And sandbox_otp is returned so local apps can still log in

  Scenario: Play Review never sends SMS
    Given the profile tenant domain is play-review
    When they request an OTP
    Then Africa's Talking is not called
    And the client is told to use 123456

  Scenario: Demo login OTP is live; operational SMS stays dry-run
    Given a tenant with is_demo true
    When they request a login OTP in production with live AT credentials
    Then the OTP SMS is dispatched
    When send-sms handles an alerts_queue row for that tenant
    Then it marks processed without calling Africa's Talking
```

## Automation map

| Scenario | Test path | Status |
| :--- | :--- | :--- |
| Live host + no sandbox_otp | `apps/admin_dashboard/src/lib/africasTalkingSms.test.ts`, `apps/admin_dashboard/src/lib/issuePhoneOtp.test.ts` | passing |
| Dry-run returns sandbox_otp | `apps/admin_dashboard/src/lib/africasTalkingSms.test.ts`, `apps/admin_dashboard/src/lib/issuePhoneOtp.test.ts` | passing |
| Play Review skip SMS | `apps/admin_dashboard/src/lib/issuePhoneOtp.test.ts` | passing |
| Demo OTP live vs ops dry-run | `apps/admin_dashboard/src/lib/issuePhoneOtp.test.ts` (OTP); send-sms demo branch unchanged | passing |
