# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Parent iOS avatar upload |
| **Stack** | Flutter parent app + Next.js `/api/parent/avatar` |
| **Owner path(s)** | `apps/parent_app/lib/utils/parent_avatar_logic.dart`, `apps/parent_app/lib/utils/parent_avatar_image.dart`, `apps/admin_dashboard/src/app/api/parent/avatar/route.ts` |
| **Started** | 2026-08-28 |
| **Status** | `passing` |

## Goal

iPhone camera/library photos (HEIC or large JPEG) must be re-encoded before `POST /api/parent/avatar`, which only accepts JPEG/PNG/WebP under 3.5 MB.

## Scenarios

```gherkin
Feature: Parent iOS avatar upload

  Scenario: HEIC from iPhone must be re-encoded
    Given a photo whose bytes start with ftyp heic
    When the parent app prepares the upload
    Then the payload is marked for re-encode

  Scenario: Oversized JPEG must be re-encoded
    Given a JPEG larger than 1.2 MB
    When the parent app prepares the upload
    Then the payload is marked for re-encode

  Scenario: Server still rejects raw HEIC
    Given a HEIC body posted to /api/parent/avatar
    When the image is decoded
    Then it is rejected as not a JPEG/PNG/WebP
```

## Automation map

| Scenario | Test path | Status |
| :--- | :--- | :--- |
| HEIC from iPhone must be re-encoded | `apps/parent_app/test/parent_avatar_logic_test.dart` | passing |
| Oversized JPEG must be re-encoded | `apps/parent_app/test/parent_avatar_logic_test.dart` | passing |
| Server still rejects raw HEIC | `apps/admin_dashboard/src/lib/parentAvatar.test.ts` | passing |
