# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Demo driver OTP SMS delivery |
| **Stack** | `next` |
| **Owner path(s)** | `apps/admin_dashboard/src/app/api/auth/driver-request-otp/route.ts` |
| **Started** | 2026-08-10 |
| **Status** | `manual verification only` |

## Goal

Registered demo-school drivers and conductors receive a fresh expiring login OTP through Africa’s Talking, while the permanent Play Review account remains stable and unknown phone numbers remain blocked.

## Scenarios

```gherkin
Feature: Demo driver OTP SMS delivery

  Scenario: Demo driver › requests OTP › fresh expiring code is sent by SMS
    Given an available registered driver belongs to a demo school
    When the driver requests a verification code
    Then a new random six-digit OTP is stored with a 15-minute expiry
    And the new OTP is sent through the configured SMS gateway

  Scenario: Play Review driver › requests OTP › permanent review code is retained
    Given the driver belongs to the permanent play-review tenant
    When the driver requests a verification code
    Then OTP 123456 is sent without being replaced or expired

  Scenario: Unknown phone › requests OTP › no SMS is sent
    Given the phone is not registered to a driver or conductor
    When an OTP is requested
    Then the API returns not found with guidance to contact the school
    And the Driver app shows that guidance instead of a generic error
    And the SMS gateway is not called
```

## Automation map

| Scenario title | Test / verification | Status |
| :--- | :--- | :--- |
| Demo dynamic OTP is stored and sent | Local Azima sandbox request + Africa’s Talking Outbox | `verified manually` |
| Play Review OTP remains permanent | Code review + existing Play Review credentials | `verified manually` |
| Unknown phone sends nothing | API guard code review | `verified manually` |

## Notes

- Operational trip/proximity messages remain dry-run for demo tenants.
- OTP and phone values must not be written to application logs.
- OTP-related test files were removed at the user’s request because repository secret scanning flagged their synthetic credentials. Verification is currently manual plus production compilation.
