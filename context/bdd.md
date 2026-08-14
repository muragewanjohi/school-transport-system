# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Student registry route + trip filter |
| **Stack** | `next.js` (admin dashboard) |
| **Owner path(s)** | `apps/admin_dashboard/src/lib/studentRegistryFilter.ts`, `apps/admin_dashboard/src/lib/studentStopAssignment.ts`, `apps/admin_dashboard/src/app/students/page.tsx` |
| **Started** | 2026-08-14 |
| **Status** | `passing` |

## Goal

On Student Manifests Registry, operators can change a student’s route and pick-up/drop-off trips in the table, then filter the list by route or trip.

## Scenarios

```gherkin
Feature: Student registry trip assignment

  Scenario: Changing route clears trips and remaps stops
    Given a student on route A with assigned trips
    When the operator selects route B
    Then pickup and drop-off stops are remapped to route B
    And schedule_ids are cleared

  Scenario: Filter by trip shows only assigned students
    Given students assigned to different trips
    When the operator filters by one trip
    Then only students with that schedule id are listed

  Scenario: Filter by route shows only students on that route
    Given students assigned to different routes
    When the operator filters by one route
    Then only students with that route id are listed

  Scenario: Merge pick-up trip keeps drop-off trip
    Given a student with a pick-up and drop-off schedule
    When the operator changes only the pick-up trip
    Then the drop-off schedule id is unchanged
```

## Automation map

| Scenario title | Test / verification | Status |
| :--- | :--- | :--- |
| Changing route clears trips and remaps stops | `src/lib/studentStopAssignment.test.ts` | `passing` |
| Filter by trip shows only assigned students | `src/lib/studentRegistryFilter.test.ts` | `passing` |
| Filter by route shows only students on that route | `src/lib/studentRegistryFilter.test.ts` | `passing` |
| Merge pick-up trip keeps drop-off trip | `src/lib/studentRegistryFilter.test.ts` | `passing` |
