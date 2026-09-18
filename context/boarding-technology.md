# Boarding Technology — BLE iBeacon (Primary)

**Status:** Committed product direction. Spec locked; field validation of DX-CP35 samples required before Driver App / API implementation or volume procurement.

**Audience:** Product + engineering. School-facing security summary remains in [architecture-security.md](architecture-security.md).

**Related:** [project-overview.md](project-overview.md), [architecture.md](architecture.md), [ui-context.md](ui-context.md), [pre-school-readiness.md](pre-school-readiness.md).

---

## 1. Product decision

| Role | Technology |
| :--- | :--- |
| **Primary** | Hands-free **BLE iBeacon / Eddystone** student tags scanned by the Driver App on an Android phone during an active trip |
| **Safety fallback** | Manual driver/conductor checklist (always available) |
| **Legacy / non-primary** | NFC tap (`nfc_manager` / `nfc_card_hash`) — do not market as live boarding; keep until BLE ships, then migrate |

**Deployment model (v1 transport):**

- No wired bus readers, no UHF doorway hardware, no OBD telematics for boarding.
- Student wears or carries a thin BLE badge / backpack tag.
- Driver phone stays in a **fixed mount** near the door or cabin front (consistent RSSI).
- Scanning runs only while a trip is active (and during drop-off campus roll-call when auto-assist is enabled later).
- Events are **confidence-based**. Parent boarding/drop-off SMS and push fire only after **confirmation**, not on first sighting.

**Hardware story vs GPS Goal #1:** “Zero-hardware friction” means **no vehicle telematics box**. Student BLE tags are required for automated boarding. Schools can still run GPS-only trips with **manual** check-in until tags are provisioned.

**Reality today:** Spec + provision APIs + Driver Provision Tag UI + confidence engine landed. Physical password lock uses a first-party CP35 GATT client behind `DxBeaconPlugin` (vendor has no AAR; DX-SMART remains a lab fallback). Trip auto-attendance not yet wired into the live trip UI — manual checklist remains the operational path. Do not demo automated BLE boarding to schools until field go + live wire-up Done.

---

## 2. Reference hardware (pilot samples)

Pilot tags: **DX-CP35** (DX-SMART / AliExpress “Indoor Assert” BLE 5.1 beacon).

| Spec | Value |
| :--- | :--- |
| Chipset | Renesas DA14531 |
| Radio | BLE 5.1 |
| Protocols | iBeacon + Eddystone (UID, URL, TLM, Device Info); up to 7 UUID frames |
| Battery | Replaceable CR2032; ~38.61 µA working; ~9 months claimed |
| Enclosure | ~6.7 mm thick; IP67; CE / FCC / RoHS |
| Open-air range | 50–70 m (too far for phone-only boarding unless TX is reduced) |
| Config | **DX-SMART** app (Android / iOS); vendor SDK available ([GitHub](https://github.com/DX-SMART/BLUETOOTH-BEACON), seller Google Drive) |

Thinner CP35-class tags at volume are acceptable if they keep replaceable battery, iBeacon + Eddystone TLM, configurable TX / advertise interval, and IP rating suitable for school bags.

---

## 3. Detection model

BLE does **not** prove “crossed the door.” It proves **presence near the scanner phone**. Confirmation uses trip context + movement.

### 3.1 Event states

| State | Meaning |
| :--- | :--- |
| `candidate` | Rules partially met; do not notify parents |
| `confirmed` | Attendance written to `trip_manifests`; parents may be notified |
| `uncertain` | Signal missing/ambiguous; show for driver review |
| `corrected` | Driver/conductor overrode auto or manual state |

Attendance source of truth remains **`trip_manifests.attendance`** (`pending` \| `boarded` \| `dropped_off` \| `absent` \| `no_show`). Persist event provenance (`manual` \| `ble_auto`) when implemented.

### 3.2 Pickup (`HOME_TO_SCHOOL`)

```text
Student not onboard
+ bus inside student's pickup_stop geofence (existing stop-gated rule)
+ beacon appears repeatedly (e.g. ≥3–5 observations over 10–20 s)
+ bus leaves the stop geofence
+ beacon continues travelling with the bus (still observed after ~100–200 m)
= BOARDING CONFIRMED → trip_manifests.attendance = boarded
```

Do **not** confirm boarded merely because the beacon appeared at the stop (waiting siblings / parents nearby).

### 3.3 Drop-off (`SCHOOL_TO_HOME` at home stop)

```text
Student confirmed onboard; beacon healthy before the stop
+ bus enters that student's dropoff_stop geofence
+ bus dwells at least min_stop_dwell_seconds (existing config)
+ beacon disappears around the stop
+ bus leaves the geofence
+ beacon remains absent ~30–90 s or ~100–300 m after departure
= DROP-OFF CONFIRMED → trip_manifests.attendance = dropped_off
```

Cancel the candidate if the beacon reappears strongly. Never infer drop-off at an unassigned stop. If the beacon was already missing before arrival → `uncertain`, not dropped off.

### 3.4 Drop-off campus roll-call (before Start Trip)

v1 **keeps manual SwitchListTile campus boarding** as the gate for `SCHOOL_TO_HOME` start (409 until every row is boarded/absent). BLE may later **assist** (highlight likely-present students) but must not silently Start Trip or auto-board the full roster without driver confirmation until a separate Architecture Decision unlocks it.

### 3.5 Supporting signals (not sole triggers)

- RSSI / calibrated RSSI@1m — supporting confidence only; never a hard “inside bus” threshold alone.
- Advertise interval / TX power — tuned in DX-SMART for the pilot (prefer **low TX**, ~400–500 ms interval).
- Manifest membership, assigned stop, trip direction, previous attendance, adjacent-bus conflict resolution.
- Eddystone **TLM** battery voltage when available → tag health.

### 3.6 Failures and fallback

| Case | Behavior |
| :--- | :--- |
| Bluetooth off / permission denied | Degrade to manual checklist; clear UI copy |
| Dead / forgotten tag | `uncertain` + manual Boarded / Absent |
| Two buses hear same tag | Prefer trip that already has student onboard / assigned vehicle; escalate as conflict |
| Offline | Queue candidate/confirmed events locally; sync when online (greenfield — not in app today) |
| Driver correction | Always allowed; parent notify only on net confirmed transition |

Parent boarding/drop-off alerts continue to come from `on_manifest_attendance_update` when attendance becomes `boarded` / `dropped_off` — whether the write was manual or `ble_auto`.

---

## 4. Identity, provisioning, and schema

### 4.1 Physical identity

- Broadcast **opaque** iBeacon UUID + Major + Minor (and/or Eddystone UID). **Never** student name, admission number, phone, or school slug in the advertisement.
- Prefer one **tenant-scoped UUID**; unique **Minor** (or Major+Minor) per tag.
- Device **broadcast name** stays factory/neutral (`CP35-49B1`, `OTB-M1`) — never the student name.
- Lost tags: revoke assignment immediately; reissue a new Minor (or new tag).

### 4.2 Two Driver App units (split required)

| Unit | Purpose | Tech |
| :--- | :--- | :--- |
| **A — Provision** | Configure tag frames + lock password + bind to student | First-party CP35 GATT via MethodChannel — **Android first** |
| **B — Trip boarding** | Passive advertisements during active trip | Standard BLE scan (`flutter_blue_plus`); **no vendor SDK** on the hot path |

Do not merge provision UI and trip-scan UI in one implementation step ([ai-workflow-rules.md](ai-workflow-rules.md)).

### 4.3 Tag provisioning (Driver App + SDK)

Production schools **do not** rely on the public DX-SMART app for routine setup.

Authorized staff use **Driver App → Provision Tag** (driver or conductor session on **Android**):

1. Scan / connect to nearby CP35.
2. Authenticate to the tag with the device password.
3. Apply tenant template: UUID, Major, Minor, TX **−19.5 dBm**, iBeacon interval **400 ms**, TLM **800 ms**, Trigger **OFF**.
4. On first OnTheBus provision: replace factory password `DX1234` with the tenant-scoped 6-character password.
5. Restart tag → POST assignment to API → link to selected student.

iOS driver provisioning is out of scope until vendor iOS SDK is confirmed. Admin web can revoke/assign metadata only — browsers cannot configure CP35.

### 4.4 Password model (two layers)

| Layer | Purpose | Where stored |
| :--- | :--- | :--- |
| **Tag device password** | CP35 requires 6-char password on FFE3 within 30s of connect; change via cmd `0x24` (factory default **`DX1234`**) | On tag firmware; active password encrypted in `tenant_configs.beacon_device_password_enc` |
| **App provision gate** | **Mandatory** 6-digit **Provision PIN** for Driver App → Provision Tag (Load template / provision). Drivers/conductors **enter** it; only school admins **set/rotate** it on web Config | Hash only in `tenant_configs.beacon_provision_pin_hash` |

Rules:

- On **real school create**, **demo store provision**, and **play-review** seed: auto-generate a 6-digit Provision PIN, store the hash, and email the plaintext once to the school contact (demo access email / onboard email). Play-review uses fixed PIN **`654321`**.
- School admin may **rotate** the PIN on `/config` (plaintext shown once in the UI; never persisted). Drivers cannot set or rotate the PIN.
- Empty or wrong PIN → API `403`. Legacy tenants with null hash → `403` “Provision PIN not configured — ask school admin” until Config generates one.
- Generate a **tenant-scoped random 6-character alphanumeric** **tag device** password once per school (first template load if missing).
- After tag lock, **DX-SMART cannot modify** the tag without the device password.
- Never log PINs/passwords, write them to analytics, or show them in parent UI. Do not email the tag device password.
- Factory-reset password **`1234`** is support-only; reset reverts vendor defaults and requires re-provision in OnTheBus.

### 4.5 Data model

- Table `student_beacon_tags`: `tenant_id`, `student_id`, `uuid`, `major`, `minor`, `mac`, `device_name`, `status` (`active` \| `revoked`), `provisioned_at`, `revoked_at`.
- `tenant_configs`: `beacon_uuid`, `beacon_device_password_enc`, `beacon_provision_pin_hash`, `beacon_next_minor`.
- Legacy `students.nfc_card_hash` remains until fully migrated. Do not paste BLE Minor into `nfc_card_hash`.
- Uniqueness: one active tag per student per tenant; one student per active MAC / (uuid, major, minor).

### 4.6 Admin UX

- Student create/edit: prefer beacon assignment from Driver Provision Tag; **read-only BLE Tag** section on student edit (UUID, Major, Minor, MAC, status, provisioned_at). NFC Card Hash labeled legacy.
- `/config`: show whether Provision PIN is configured; **Generate / Rotate** returns plaintext once. Never display stored PIN (hash only).
- Show tag health (last seen, TLM battery) when available.
- Revoke lost tags from admin (metadata only).

---

## 5. Security and privacy

- Tags carry **no PII**. Backend resolves opaque IDs under authenticated driver/admin sessions only.
- Static iBeacon IDs are **observable and cloneable**. Mitigations: opaque random IDs, stop-geofence + bus-movement confirmation, adjacent-bus conflict rules, immediate revoke on loss, **device password lock** so casual DX-SMART edits fail.
- Provision APIs return the device password only to an authenticated driver/conductor provision session — never cache long-term in SharedPreferences plaintext.
- Logs: never write student name + beacon ID + exact coordinates + password together. Sanitize like other PII rules in [architecture.md](architecture.md).
- Campus gate / classroom expansion (Phase 2+) increases tracking surface — requires privacy review before enabling continuous campus presence.

---

## 6. Driver / conductor UX requirements

Documented for [ui-context.md](ui-context.md):

- **Provision Tag** screen (Android): scan list, optional provision PIN, student picker, success copy *“Tag locked — only OnTheBus can reconfigure this tag.”*
- Trip-scoped **scan health** indicator (Bluetooth on, scanning, last observation age).
- Auto-event toast / row highlight for confirmed boarded / dropped off.
- Clear **uncertain** / signal-unavailable states.
- Manual **Boarded** / **Dropped off** / **Absent** remain primary controls until confidence is high; then they become correction tools.
- No “tap card” success metaphor for BLE; use “detected / confirmed / needs review”.

---

## 7. Platform permissions

- Android: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT` (neverForLocation where possible); keep location as already required for GPS.
- iOS: Bluetooth usage strings for **trip scan only** in v1 (provisioning Android-first).
- Split BLE provision MethodChannel from trip scan service and from boarding UI.
- Tests: fake BLE MethodChannels; never require physical beacons to mark a unit Done ([code-standards.md](code-standards.md)).

---

## 8. Operations and commercial servicing

- Eddystone TLM (or last-seen heuristics) → automated tag-health monitoring.
- School package: monthly **health report**; replace weak/missing tags; **termly** physical inspection — not necessarily on-site battery swap for every tag every month.
- Battery / replacement / reassignment can be a recurring service line after pilot pricing is set.
- Fixed phone mount + power bank guidance for drivers (no permanent bus wiring required).

---

## 9. Field validation gate (before app code / volume buy)

Configure three DX-CP35 samples in DX-SMART (opaque UUID/Major/Minor, low TX, ~400–500 ms interval, TLM on). Use a fixed-mount Android phone with a BLE scanner app (not Driver App yet).

| ID | Scenario | Pass if |
| :--- | :--- | :--- |
| T1 | Tag outside at stop; phone on bus; bus stays | Note RSSI; detection possible |
| T2 | Tag boards; bus drives away | Tag stays visible while moving |
| T3 | Tag stays at stop; bus leaves | Tag disappears and stays gone |
| T4 | Tag in backpack at rear seat | Still detected while onboard |
| T5 | Two tags at stop; only one “boards” | Correct Minor travels with bus |
| T6 | Tag left on seat after “drop-off” | Presence remains until removed |
| T7 | TX power sweep | Lowest TX that passes T2+T4 without failing T3 |

**Go** for Driver App BLE implementation only if **T2, T3, and T4** pass.

**No-go** if backpack/rear seat vanishes or outside waiters stay “onboard” after departure even after TX reduction.

---

## 10. Phased roadmap

| Phase | Scope |
| :--- | :--- |
| **0** | This spec + CP35 sample field tests |
| **1a** | Driver App Android **Provision Tag** + password lock + `student_beacon_tags` API |
| **1b** | Driver App trip BLE scan + confidence rules + manual fallback |
| **2** | School **gate** entry/exit with dedicated gateway(s) / dual-reader direction — same student tag |
| **3** | Classroom presence assist (confidence-based; adjacent-room false positives expected) |

Gate/classroom localization remains **out of transport v1 scope** until Phase 1 passes ([project-overview.md](project-overview.md) Out of Scope). Do not sell classroom tracking until Phase 3 pilots succeed.

---

## 11. CP35 GATT provisioning (no vendor AAR)

Vendor confirmed (commercial support): **no pre-built AAR**. Integration materials are Android demo source + GATT UUID spec + CP35 user manual. OnTheBus implements a **first-party GATT client** under `DxBeaconPlugin` — do **not** copy `com.dxlq` demo packages into the Driver App. Never commit vendor zip/rar archives.

| Item | Finding |
| :--- | :--- |
| Vendor repo | [DX-SMART/Beacon](https://github.com/DX-SMART/Beacon) (alias BLUETOOTH-BEACON) |
| Docs package | DX-CP35 Development & User Information (GATT UUID + manual) |
| App (lab only) | DX-SMART V3.7+ on Play Store / GitHub releases |
| Factory connect password | `DX1234` (6 chars) |
| Factory reset password | `1234` |
| Trip scan | **No vendor SDK required** — parse standard iBeacon / Eddystone advertisements |
| Provision radio | First-party Kotlin GATT client (`Cp35GattClient`) — MethodChannel surface unchanged |
| MethodChannel | `com.schooltrack.driver_app/dx_beacon` — `scanNearbyBeacons`, `connect`, `unlock`, `writeIBeacon`, `enableTlm`, `setDevicePassword`, `restart`, `disconnect` |

### GATT surface (vendor spec)

| UUID | Role |
| :--- | :--- |
| Service `0000FFE0-…` | Command & data |
| Char `0000FFE1-…` | Notify (RX) |
| Char `0000FFE2-…` | Write (TX commands) |
| Char `0000FFE3-…` | App connection password (UTF-8); must write within **30 s** of connect or tag disconnects |
| Service `0000180F` / `00002A19` | Battery level notify (optional health) |

Framed commands on `FFE2` use: `4E 4F | cmd | len | payload | xor` (xor over cmd+len+payload). Password change cmd **`0x24`** (6 bytes). Save config **`0x60`**. iBeacon UUID/Major/Minor writes **`0x74` / `0x75` / `0x76`**. Password is plaintext on air (vendor design) — never log it; provision only in a controlled area.

Unit B (trip scan) does **not** depend on this GATT path.

### Pilot password lock checklist (3 samples) — post-merge, not CI

1. Re-provision each CP35 through **Driver App** (not DX-SMART).
2. Confirm password changed from `DX1234` → tenant password.
3. Open DX-SMART → connect → enter `DX1234` → **must fail**.
4. Open Driver Provision Tag → unlock with tenant password → **must succeed**.
5. Keep tenant password in a secure offline note until admin rotation UI exists.

---

## 12. Spec sync checklist

When this file changes, also update:

- [project-overview.md](project-overview.md) — goals, flows, success criteria
- [architecture.md](architecture.md) — boundaries, protection model, parent boarding alert wording
- [architecture-security.md](architecture-security.md) — badge / beacon section
- [ui-context.md](ui-context.md) — driver BLE UX + Provision Tag
- [code-standards.md](code-standards.md) / [ai-workflow-rules.md](ai-workflow-rules.md) — BLE permissions & fakes
- [pre-school-readiness.md](pre-school-readiness.md) — known gaps + D21
- [progress-tracker.md](progress-tracker.md) — Architecture Decision + Next Up
- Overwrite [bdd.md](bdd.md) when starting a BLE code module

---

## 13. Open questions (resolved for v1)

| Topic | Decision |
| :--- | :--- |
| Primary boarding radio | BLE (committed) |
| Bus wiring / UHF | Not for v1 solo deployment |
| Campus before Start Trip | Manual SwitchListTile remains authoritative |
| Parent notify timing | Only after confirmed attendance write |
| NFC | Legacy / non-primary; not marketed as live |
| Gate / classroom | Phase 2+ after bus detection works |
| Tag config app | OnTheBus Driver Provision Tag (Android); DX-SMART only for lab |
| Tag password | Tenant-scoped 6-char; replace factory `DX1234` on first provision |
