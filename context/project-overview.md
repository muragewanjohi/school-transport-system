# Safaricom-Linked School Transport Tracking Ecosystem

## Overview

This application is a multi-tenant B2B2C school transport tracking and student security platform designed for private schools. It bridges the communication gap between school administrations, transport drivers, and parents by providing real-time fleet telemetry alongside automated student check-ins. By utilizing a hybrid architecture of driver smartphone GPS tracking and physical smart NFC/RFID student ID badges, the platform eliminates the daily anxiety of school transit, automates student attendance manifest tracking, and delivers reliable proximity and boarding alerts directly to parents via automated Safaricom/Airtel SMS and push notifications.

## Goals

1. **Zero-Hardware Friction Deployment:** Enable schools to launch real-time fleet tracking within 48 hours using only the Driver mobile application's GPS streaming, removing the necessity of upfront vehicle telematics hardware.
2. **High-Reliability Automated Check-Ins:** Achieve 99% accuracy in student boarding logs through physical NFC card taps against the driver’s phone or bus terminal, completely eliminating manual driver checklist entry errors.
3. **Guaranteed Alert Delivery:** Ensure proximity and drop-off alerts reach parents reliably by implementing an automated SMS fallback engine through Africa's Talking, maintaining delivery even when parents lack active mobile data.
4. **Multi-Tenant Data Isolation:** Ensure absolute security and structural isolation of student routing, tracking data, and administrative metrics between different school entities sharing the platform infrastructure.

## Core User Flow

1. **School System Initialization:** School administrator logs into the web dashboard, defines transport routes, assigns drivers to specific routes, and registers student profiles linked to unique NFC card serial numbers.
2. **Trip Activation:** The driver logs into the Driver mobile application, selects their scheduled route (e.g., "Route 4 - Morning"), and taps "Start Trip." This action activates background high-precision GPS streaming to the backend server.
3. **Proximity Alert Triggering:** As the bus enters a pre-configured geofence boundary (e.g., 1 km radius) near a student's home, the backend database detects the intersection and fires an automated SMS proximity alert to the parent: *"Bus is 5 mins away. Please head out."*
4. **Automated Boarding Verification:** The student boards the bus and taps their custom branded NFC ID card against the phone/reader. The Driver app verifies the serial number, changes the student's status to green on the digital manifest checklist, and sends an instant notification to the parent: *"James has boarded the bus at 7:12 AM."*
5. **Trip Finalization:** Upon arrival at the school, the driver completes a physical safety sweep of the vehicle, verifies that all students are checked off the active manifest list, and taps "End Trip," which shuts off GPS tracking to optimize battery consumption.

## Features

### School Administration Console
- **Live Fleet Overview Matrix:** A web-based bird's-eye map view rendering real-time positions, active telemetry, and transit velocities of all running buses.
- **Multi-Tenant Student Registry:** An administrative portal for enrolling students, assigning them to localized transit routes, and provisioning unique printed NFC security cards.
- **Automated Attendance Logs:** Digital ledgers detailing exact historical timestamps of when each student stepped onto or off a transport vehicle across different terms.

### Glanceable Driver Mobile Interface
- **Dynamic Route Checklists:** A streamlined UI presenting the sequenced order of student pickups or drop-offs optimized for minimizing transit times.
- **Chunky Tap Targets & Manifest Toggles:** Oversized UI action components allowing drivers to execute single-tap manual overrides or check-ins if a student forgets their security card.
- **One-Touch Emergency SOS Activation:** An instantaneous panic link that transmits immediate coordinates and breakdown/emergency alerts back to the administration console.

### Parent Notification Hub
- **Dual-Channel Alert Engine:** Parallel pipeline delivering real-time push notifications inside the Parent App alongside direct-to-device transactional SMS alerts.
- **Estimated Time of Arrival (ETA) Triggers:** Configurable proximity tracking boundaries that calculate vehicle velocities to alert parents exactly when to walk out to the pickup point.

## Scope

### In Scope
- A multi-tenant administrative web portal for school configuration, asset monitoring, and data management.
- A cross-platform mobile application optimized for drivers, featuring high-precision background location streaming and NFC scanning capabilities.
- A cross-platform mobile application for parents, delivering live map rendering of their child's specific bus route and notification settings.
- A real-time data ingestion pipeline handling concurrent GPS tracking strings and formatting telemetry payload distributions.
- A transactional SMS communication system integrated via bulk gateway aggregators (Africa's Talking API) mapping to custom branded Sender IDs.

### Out of Scope
- Native hardware engine tuning or OBD-II hardware fuel diagnostic configurations (initial architecture remains hardware-free / app-to-app).
- In-app payment gateways for general school fee collection outside the specialized app-subscription monetization tracking.
- Indoor campus navigation or indoor classroom localization tracking once the student leaves the transport vehicle boundary.

## Success Criteria

1. A driver can log into the application, start a trip, and reliably stream latitude/longitude coordinates to the cloud database at a configured polling rate of 5-second intervals without app crashes.
2. The backend service calculates vehicle proximity entries through active geofence rings and passes a formatted payload to the SMS gateway API within 2 seconds of fence intersection.
3. A student can tap a standard 13.56 MHz NFC card against a mobile device running the Driver application and have the matching record instantly updated and isolated within that school's database partition.
4. The system maintains absolute multi-tenant boundaries, preventing any school administrator from viewing or querying tracking logs, vehicle locations, or student registers belonging to an external institution.