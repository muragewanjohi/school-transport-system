# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Student location search is Google Maps only |
| **Stack** | Next.js admin dashboard |
| **Owner path(s)** | `apps/admin_dashboard/src/components/HomeLocationMapPicker.tsx`, `apps/admin_dashboard/src/lib/homeLocationSearch.ts` |
| **Started** | 2026-08-28 |
| **Status** | `passing` |

## Goal

Student (and shared home-location) search uses Google Places via `/api/maps/places`. OpenStreetMap Nominatim is not called from the admin console.

## Scenarios

```gherkin
Feature: Student location search is Google Maps only

  Scenario: Places results map to picker suggestions
    Given Google Places returns Ruaka with lat/lon
    When results are mapped for the home location picker
    Then each suggestion uses Google Places as the source
    And center is [lon, lat]

  Scenario: Nominatim is not a search source
    Given the home location picker search helper
    When suggestion sources are listed
    Then OpenStreetMap and Nominatim are not included
```

## Automation map

| Scenario | Test path | Status |
| :--- | :--- | :--- |
| Places results map to picker suggestions | `apps/admin_dashboard/src/lib/homeLocationSearch.test.ts` | passing |
| Nominatim is not a search source | `apps/admin_dashboard/src/lib/homeLocationSearch.test.ts` | passing |
