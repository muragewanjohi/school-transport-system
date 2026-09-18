# DX-CP35 BLE Field Validation Checklist

Use this checklist before volume purchasing or relying on BLE for automatic boarding and drop-off. One person drives; another handles the scanner and tags.

## Test information

- [ ] Test completed
- **Tester:** ______________________________
- **Date:** ______________________________
- **Vehicle:** ______________________________
- **Scanner phone/model:** ______________________________
- **Scanner app/version:** ______________________________
- **Phone mounting position:** ______________________________
- **Weather/location:** ______________________________

## Beacon configuration

| Setting | Test value |
| :--- | :--- |
| UUID | `A1B2C3D4-E5F6-4789-A012-3456789ABCDE` |
| Major | `1` |
| Tag 1 | `CP35-49B1` / Minor `1` |
| Tag 2 | `CP35-4937` / Minor `2` (confirm iBeacon frame) |
| Tag 3 | `CP35-4A02` / Minor `3` |
| iBeacon interval | `400 ms` |
| TLM interval | `800 ms` |
| TX power | `-19.5 dBm` initially |
| RSSI@1m | `-57 dBm` initially |
| Trigger | Off |

## Preparation

- [X] Install nRF Connect or another BLE scanner on the scanner phone.
- [X] Enable Bluetooth and required permissions.
- [X] Fix the phone near the vehicle doorway/cabin front.
- [X] Do not move the phone during a test run.
- [X] Confirm each tag is visible and its Minor is correct.
- [X] Choose a safe, quiet road or parking area.
- [X] Record RSSI over 30–60 seconds; do not judge from one reading.

## Preliminary stationary results — 2026-09-16

- [X] Tags inside a school bag remained actively detectable up to approximately **4 m with the vehicle door closed**.
- [X] Tags inside a school bag remained actively detectable up to approximately **5 m with the vehicle door open**.
- [X] At approximately **8 m or more**, tags were no longer actively detected.
- [X] `CP35-4937` was left in the open at 8+ m and was not actively detected.
- [X] Walking outside a room and returning showed active detection again within approximately 5 m.
- [X] Grey scanner entries were treated as **stale/cached devices, not active detections**.

**Preliminary interpretation:** The `-19.5 dBm` setting creates a useful short-range zone and is promising for separating tags near the vehicle from tags left farther away. These results do **not** yet pass T2, T3, or T4 because the scanner and tags were not tested during vehicle movement.

**Screenshot RSSI examples (distance not controlled):**

| Tag | Observed active RSSI |
| :--- | :--- |
| `CP35-4A02` | approximately `-78` to `-80 dBm` |
| `CP35-49B1` | approximately `-98 dBm` in one weak observation |
| `CP35-4937` | approximately `-93` to `-94 dBm` in weak observations |

---

## T1 — Tag outside while vehicle remains stopped

**Purpose:** Establish the outside-at-stop baseline.

1. Place Minor `1` approximately 3–5 m outside the vehicle door.
2. Keep the vehicle and scanner phone stationary.
3. Observe the tag for 60 seconds.

- [X] **PASS** — tag appears repeatedly.
- [ ] **FAIL** — tag never appears or appears only once.

| Measurement | Result |
| :--- | :--- |
| Distance from door | Active to ~4 m closed / ~5 m open |
| Strongest RSSI | ______ dBm |
| Typical/median RSSI | ______ dBm |
| Weakest RSSI | ______ dBm |
| Approx. detections in 60 s | ______ |

**Notes:** Tags were tested inside a school bag. Active detection stopped at approximately 8+ m. Grey entries were stale rather than fresh advertisements.

---

## T2 — Tag boards and travels with vehicle (critical)

**Purpose:** Confirm an onboard tag remains detectable after departure.

1. Start with Minor `1` outside the vehicle.
2. Carry it into the vehicle and sit in the front/middle.
3. Drive 150–300 m from the test stop.
4. Continue observing for 60 seconds while moving.

- [ ] **PASS** — tag remains regularly visible while travelling.
- [ ] **FAIL** — tag disappears for extended periods while onboard.

| Measurement | Result |
| :--- | :--- |
| RSSI outside before boarding | ______ dBm |
| RSSI onboard while stopped | ______ dBm |
| Typical RSSI while moving | ______ dBm |
| Longest detection gap | ______ seconds |
| Distance travelled | ______ m |

**Notes:**  
__________________________________________________________________  
__________________________________________________________________

---

## T3 — Tag remains at stop while vehicle leaves (critical)

**Purpose:** Confirm a student left behind is not treated as onboard.

1. Leave Minor `1` at the test stop with a helper.
2. Drive away with the scanner phone.
3. Continue for at least 300 m and observe for 60 seconds.

- [ ] **PASS** — tag disappears and remains absent after departure.
- [ ] **FAIL** — tag remains strongly/regularly detected after departure.

| Measurement | Result |
| :--- | :--- |
| Last RSSI before departure | ______ dBm |
| Distance when last detected | ______ m |
| Time until no longer detected | ______ seconds |
| Any later detections? | Yes / No |
| RSSI of later detections | ______ dBm |

**Notes:**  
__________________________________________________________________  
__________________________________________________________________

---

## T4 — Tag inside backpack at rear seat (critical)

**Purpose:** Test the most obstructed normal onboard position.

1. Put Minor `1` deep inside a normal school backpack.
2. Place the backpack at the rear seat/farthest normal seating point.
3. Drive for 2–3 minutes.

- [ ] **PASS** — tag remains detectable most of the time.
- [ ] **FAIL** — tag is absent for extended periods.

| Measurement | Result |
| :--- | :--- |
| Typical RSSI while moving | ______ dBm |
| Weakest RSSI | ______ dBm |
| Longest detection gap | ______ seconds |
| Approx. detection coverage | ______ % |

**Notes:**  
__________________________________________________________________  
__________________________________________________________________

---

## T5 — Two tags wait; only one boards

**Purpose:** Verify that the system can distinguish the tag travelling with the vehicle.

1. Place Minor `1` and Minor `2` together at the stop.
2. Carry Minor `1` into the vehicle.
3. Leave Minor `2` with a helper.
4. Drive 150–300 m and observe both tags.

- [ ] **PASS** — Minor `1` remains visible; Minor `2` disappears.
- [ ] **FAIL** — both appear onboard or Minor `1` cannot be distinguished.

| Measurement | Minor 1 (boards) | Minor 2 (stays) |
| :--- | :--- | :--- |
| RSSI before departure | ______ | ______ |
| RSSI after 100 m | ______ | ______ |
| RSSI after 300 m | ______ | ______ |
| Last detected after departure | ______ | ______ |

**Notes:**  
__________________________________________________________________  
__________________________________________________________________

---

## T6 — Tag remains on vehicle after student exits

**Purpose:** Confirm the system follows the tag, not the person.

1. Travel with Minor `1` onboard.
2. At the test stop, the person exits but leaves the tag on a seat.
3. Drive 150–300 m and continue observing.

- [X] **PASS** — tag remains visible, so no automatic drop-off should occur.
- [ ] **FAIL** — tag disappears even though it remains onboard.

| Measurement | Result |
| :--- | :--- |
| RSSI before person exits | ______ dBm |
| Typical RSSI after departure | ______ dBm |
| Longest detection gap | ______ seconds |

**Operational finding acknowledged:**  
- [X] A child without their tag cannot be distinguished automatically.
- [X] A tag left on the bus must not generate a drop-off event.

**Notes:**  
__________________________________________________________________  
__________________________________________________________________

---

## T7 — Transmission-power sweep

**Purpose:** Find the lowest TX power that passes T2 and T4 while still passing T3.

Repeat T2, T3 and T4 at each available TX level. Do not change phone placement.

| TX power | T2 onboard | T3 left behind | T4 rear backpack | Verdict |
| :--- | :---: | :---: | :---: | :--- |
| `-19.5 dBm` | Pass / Fail | Pass / Fail | Pass / Fail | __________ |
| __________ | Pass / Fail | Pass / Fail | Pass / Fail | __________ |
| __________ | Pass / Fail | Pass / Fail | Pass / Fail | __________ |
| __________ | Pass / Fail | Pass / Fail | Pass / Fail | __________ |

- **Selected TX power:** __________________ dBm
- **Selected iBeacon interval:** __________________ ms
- **Reason:** ______________________________________________________

---

## Recommended additional tests

### T8 — Three tags enter together

- [ ] All three Minors remain independently visible.
- [ ] No tag is lost for more than ______ seconds.

### T9 — Adjacent vehicles

- [ ] Tag assigned to Vehicle A disappears from Vehicle B after separation.
- [ ] Record minimum separation needed: ______ m.

### T10 — Phone/background reliability

- [ ] Screen locked for 5 minutes while scanning.
- [ ] Scanner remains active or OS limitation is documented.
- [ ] Bluetooth off/on recovery tested.
- [ ] App killed/restarted behavior documented.

---

## Final decision

### Mandatory gate

- [ ] T2 passed.
- [ ] T3 passed.
- [ ] T4 passed.
- [ ] Selected TX setting passes all three.

### Outcome

- [ ] **GO** — proceed with Driver App field integration.
- [ ] **CONDITIONAL GO** — proceed with manual-review safeguards listed below.
- [ ] **NO-GO** — redesign phone position, tag configuration, or reader model.

**Required safeguards / changes:**  
__________________________________________________________________  
__________________________________________________________________  
__________________________________________________________________

**Final approved configuration:**  
__________________________________________________________________

**Tester signature:** ____________________  **Date:** ______________

