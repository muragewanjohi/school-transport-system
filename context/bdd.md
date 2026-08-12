# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Driver Trip Screen UI |
| **Stack** | `flutter` (driver app) |
| **Owner path(s)** | `apps/driver_app/lib/screens/trip_screen.dart`, `apps/driver_app/lib/widgets/trip_*.dart`, `apps/driver_app/lib/widgets/stop_boarding_drawer.dart`, `apps/driver_app/lib/widgets/route_map_widget.dart`, `apps/driver_app/lib/main.dart` |
| **Started** | 2026-08-12 |
| **Status** | `passing` |

## Goal

While a trip is active, the Trip tab shows progress (boarded / remaining), stop states on the map (next / upcoming / completed), in-app Navigate (no external Maps handoff), long-press SOS, and a stop boarding drawer opened by **Pickup Students** or **DropOff Students** where Complete Stop absents unchecked students and advances the next stop.

## Scenarios

```gherkin
Feature: Driver Trip Screen

  Scenario: Progress card shows boarded and remaining
    Given an active trip with 12 students and 8 Present
    When the driver opens the Trip tab
    Then the progress card shows TRIP IN PROGRESS
    And boarded count is 8 / 12 with remaining 4

  Scenario: Map markers reflect stop states
    Given visited stops and a next navigation stop
    When the Trip map renders
    Then completed stops show a green check
    And the next stop is highlighted as next
    And later stops are upcoming
    And skipped past uncompleted stops are not-visited

  Scenario: Navigate stays in-app
    Given an active trip with live GPS and a next stop
    When the driver taps Navigate on the Trip action card
    Then the map enters nav mode (camera follow / next leg emphasized)
    And the app does not launch external Google Maps from that control

  Scenario: Primary CTA label follows trip direction
    Given schedule direction HOME_TO_SCHOOL (PICKUP)
    When the stop action card renders
    Then the primary button reads Pickup Students
    Given schedule direction SCHOOL_TO_HOME (DROPOFF)
    Then the primary button reads DropOff Students

  Scenario: Stop drawer Complete Stop absents pending
    Given the bus is inside the current stop geofence
    And the stop drawer lists 4 students with 2 checked Present and 2 Pending
    When the driver taps Complete Stop
    Then the 2 Pending students are PUT to Absent
    And the stop is marked completed
    And the drawer closes
    And the next stop becomes active on the map

  Scenario: Mark CTA blocked outside geofence
    Given the bus is outside all stop geofences
    When the Trip action card renders
    Then Pickup Students / DropOff Students is disabled or shows guidance

  Scenario: Long-press SOS arms emergency telemetry
    Given an active trip
    When the driver long-presses SOS and confirms
    Then emergencyActiveProvider is true
    And the background service receives toggleSOS
```

## Automation map

| Scenario title | Test / verification | Status |
| :--- | :--- | :--- |
| Progress boarded/remaining | `test/trip_ui_logic_test.dart` | `passing` |
| Marker states | `test/trip_ui_logic_test.dart` | `passing` |
| In-app Navigate | `trip_screen.dart` navMode (no StopNavigationService) | `passing` (code path) |
| CTA label by direction | `test/trip_ui_logic_test.dart` | `passing` |
| Complete Stop absents | `stop_boarding_drawer.dart` + geo gate | `passing` (code path) |
| Geofence gate | `trip_screen.dart` canBoard + drawer | `passing` (code path) |
| SOS long-press | `trip_screen.dart` + `toggleSOS` | `passing` (code path) |

## Notes

- Geometric ETA only (haversine / speed or schedule duration slice) — no live traffic.
- Absent notes are UI-only / out of scope for persistence.
- NFC boarding remains out of scope for this module.
