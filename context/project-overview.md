# Safaricom-Linked School Transport Tracking Ecosystem

## Overview

This application is a multi-tenant B2B2C school transport tracking and student security platform designed for private schools. It bridges the communication gap between school administrations, transport drivers, and parents by providing real-time fleet telemetry alongside automated student check-ins. By utilizing a hybrid architecture of driver smartphone GPS tracking and physical **BLE iBeacon student tags** (hands-free boarding), the platform eliminates the daily anxiety of school transit, automates student attendance manifest tracking, and delivers reliable proximity and boarding alerts directly to parents via automated Safaricom/Airtel SMS and push notifications. Boarding technology detail: [boarding-technology.md](boarding-technology.md).

## Goals

1. **Zero Vehicle-Hardware Friction:** Enable schools to launch real-time fleet tracking within 48 hours using the Driver mobile application's GPS streaming — no OBD or bus telematics box. Automated boarding uses **student-worn BLE tags** (not a vehicle-mounted reader). GPS-only schools may still run trips with **manual** check-in until tags are provisioned.
2. **High-Reliability Automated Check-Ins:** Achieve reliable student boarding and drop-off logs through **hands-free BLE detection** (presence + stop geofence + bus movement confirmation), with manual driver/conductor correction always available — reducing checklist friction during busy stops.
3. **Guaranteed Alert Delivery:** Ensure proximity and drop-off alerts reach parents reliably by implementing an automated SMS fallback engine through Africa's Talking, maintaining delivery even when parents lack active mobile data.
4. **Multi-Tenant Data Isolation:** Ensure absolute security and structural isolation of student routing, tracking data, and administrative metrics between different school entities sharing the platform infrastructure.

## Core User Flow

1. **School System Initialization:** School administrator logs into the web dashboard, defines transport routes, assigns drivers to specific routes, and registers student profiles linked to unique **opaque BLE beacon identities** (UUID / Major / Minor).
2. **Trip Activation:** The driver logs into the Driver mobile application, selects their scheduled route (e.g., "Route 4 - Morning"), and taps "Start Trip." This action activates background high-precision GPS streaming to the backend server and trip-scoped BLE scanning when implemented.
3. **Proximity Alert Triggering:** As the bus enters a pre-configured geofence boundary (e.g., 1 km radius) near a student's home, the backend database detects the intersection and fires an automated SMS proximity alert to the parent: *"Bus is 5 mins away. Please head out."*
4. **Automated Boarding Verification:** The student boards with their BLE tag. The Driver app confirms boarding using detection + stop geofence + continued presence after the bus leaves the stop (not a single RSSI ping). The manifest updates and the parent is notified only after **confirmation**: *"James has boarded the bus at 7:12 AM."* Drivers can always correct manually if a tag is missing or uncertain.
5. **Trip Finalization:** Upon arrival at the school, the driver completes a physical safety sweep of the vehicle, verifies that all students are checked off the active manifest list, and taps "End Trip," which shuts off GPS tracking (and BLE scanning) to optimize battery consumption.

## Features

### School Administration Console
- **Live Fleet Overview Matrix:** A web-based bird's-eye map view rendering real-time positions, active telemetry, and transit velocities of all running buses.
- **Multi-Tenant Student Registry:** An administrative portal for enrolling students, assigning them to localized transit routes, and provisioning **BLE student tags** (bind / revoke / replace).
- **Automated Attendance Logs:** Digital ledgers detailing exact historical timestamps of when each student stepped onto or off a transport vehicle across different terms.

### Glanceable Driver Mobile Interface
- **Dynamic Route Checklists:** A streamlined UI presenting the sequenced order of student pickups or drop-offs optimized for minimizing transit times.
- **Chunky Tap Targets & Manifest Toggles:** Oversized UI action components allowing drivers to execute single-tap manual overrides or check-ins if a student’s **BLE tag is missing, dead, or uncertain**.
- **One-Touch Emergency SOS Activation:** An instantaneous panic link that transmits immediate coordinates and breakdown/emergency alerts back to the administration console.

### Parent Notification Hub
- **Dual-Channel Alert Engine:** Parallel pipeline delivering real-time push notifications inside the Parent App alongside direct-to-device transactional SMS alerts.
- **Estimated Time of Arrival (ETA) Triggers:** Configurable proximity tracking boundaries that calculate vehicle velocities to alert parents exactly when to walk out to the pickup point.

## Scope

### In Scope
- A multi-tenant administrative web portal for school configuration, asset monitoring, and data management.
- A cross-platform mobile application optimized for drivers, featuring high-precision background location streaming and **BLE beacon scanning** for hands-free boarding (manual checklist until BLE is implemented and field-validated).
- A cross-platform mobile application for parents, delivering live map rendering of their child's specific bus route and notification settings.
- A real-time data ingestion pipeline handling concurrent GPS tracking strings and formatting telemetry payload distributions.
- A transactional SMS communication system integrated via bulk gateway aggregators (Africa's Talking API) mapping to custom branded Sender IDs.

### Out of Scope
- Native hardware engine tuning or OBD-II hardware fuel diagnostic configurations (initial architecture remains free of vehicle telematics boxes; student BLE tags are in scope for automated boarding).
- In-app payment gateways for general school fee collection outside the specialized app-subscription monetization tracking.
- Indoor campus navigation, school-gate, or classroom localization once the student leaves the transport vehicle boundary (**Phase 2+** after bus BLE detection is proven — see [boarding-technology.md](boarding-technology.md)).

## Success Criteria

1. A driver can log into the application, start a trip, and reliably stream latitude/longitude coordinates to the cloud database at a configured polling rate of 5-second intervals without app crashes.
2. The backend service calculates vehicle proximity entries through active geofence rings and passes a formatted payload to the SMS gateway API within 2 seconds of fence intersection.
3. A student carrying a provisioned BLE tag can be **auto-confirmed boarded** (or dropped off) under the rules in [boarding-technology.md](boarding-technology.md) inside the correct stop geofence and tenant partition; manual override always works when the tag is absent.
4. The system maintains absolute multi-tenant boundaries, preventing any school administrator from viewing or querying tracking logs, vehicle locations, or student registers belonging to an external institution.
