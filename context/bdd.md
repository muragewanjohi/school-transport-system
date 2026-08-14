# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Driver bus assignment |
| **Stack** | `next` (admin dashboard) |
| **Owner path(s)** | `apps/admin_dashboard/src/lib/assignDriverVehicle.ts`, `apps/admin_dashboard/src/app/api/drivers/route.ts`, `apps/admin_dashboard/src/app/staff/drivers/page.tsx` |
| **Started** | 2026-08-14 |
| **Status** | `passing` |

## Goal

School admins can pick a bus when registering a driver. Changing Allocated Vehicle on Staff Drivers persists on the vehicle (`active_driver_id`) and only reports success when the write succeeds.

## Scenarios

```gherkin
Feature: Driver bus assignment

  Scenario: Register driver with a bus
    Given a school has at least one unallocated vehicle
    When an admin registers a driver and selects that bus
    Then the new driver is stored as that vehicle's active_driver_id

  Scenario: Allocate bus on the drivers page
    Given an existing driver with no bus
    When the admin chooses a vehicle in Allocated Vehicle Assignment
    Then the vehicle's active_driver_id is set to that driver and the UI reloads the saved value

  Scenario: Failed allocation is not reported as saved
    Given the assignment write fails
    When the admin chooses a vehicle
    Then they see an error and the previous assignment remains
```

## Automation map

| Scenario title | Test / verification | Status |
| :--- | :--- | :--- |
| Register driver with a bus | `src/lib/assignDriverVehicle.test.ts` | `passing` |
| Allocate bus on the drivers page | `src/lib/assignDriverVehicle.test.ts` | `passing` |
| Failed allocation is not reported as saved | `src/lib/assignDriverVehicle.test.ts` | `passing` |
