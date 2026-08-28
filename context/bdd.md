# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Driver OTP delivery for demo stores |
| **Stack** | Next.js |
| **Owner path(s)** | `apps/admin_dashboard/src/lib/issuePhoneOtp.ts` |
| **Started** | 2026-08-28 |
| **Status** | `passing` |

## Goal

Demo driver/conductor profiles use synthetic `@demo.onthebus.app` emails. Those must not count as OTP inboxes. When Africa's Talking rejects login SMS, the OTP is emailed to the demo tenant `contact_email` (the lead who requested the demo).

## Scenarios

```gherkin
Feature: Driver OTP delivery for demo stores

  Scenario: Synthetic demo emails are not OTP inboxes
    Given a profile email at demo.onthebus.app
    When usable OTP email is evaluated
    Then it is rejected

  Scenario: Demo SMS rejection emails the lead
    Given a demo driver whose profile email is synthetic
    And the tenant contact_email is a real address
    When Africa's Talking rejects the login SMS
    Then Resend emails the OTP to contact_email
    And email_hint masks that address

  Scenario: Demo SMS rejection with no lead email
    Given a demo driver with only a synthetic email
    And the tenant has no usable contact_email
    When Africa's Talking rejects the login SMS
    Then the API returns 502
    And Resend is not called
```

## Automation map

| Scenario | Test path | Status |
| :--- | :--- | :--- |
| Synthetic demo emails are not OTP inboxes | `apps/admin_dashboard/src/lib/issuePhoneOtp.test.ts` | passing |
| Demo SMS rejection emails the lead | `apps/admin_dashboard/src/lib/issuePhoneOtp.test.ts` | passing |
| Demo SMS rejection with no lead email | `apps/admin_dashboard/src/lib/issuePhoneOtp.test.ts` | passing |
