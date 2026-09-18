# Module: BLE tag provisioning — CP35 GATT (Driver App Android)

**Status:** `passing`  
**Stack:** Flutter driver_app MethodChannel + Kotlin `Cp35GattClient` + Next.js `/api/driver/beacon/*`

## Scenarios

### Happy — first provision with factory password
```gherkin
Given a CP35 tag still using factory password DX1234
And a driver session for tenant T with beacon_uuid configured
When the driver provisions the tag for student S with Minor N
Then the GATT client unlocks via FFE3 within 30s
And the tag iBeacon UUID/Major/Minor match the tenant template
And the device password is changed to the tenant password (cmd 0x24)
And student_beacon_tags stores an active row for S
```

### Happy — re-provision with tenant password
```gherkin
Given a tag already locked with the tenant password
When the driver re-provisions with the correct password
Then configuration succeeds and the assignment is updated
```

### Failure — wrong password
```gherkin
Given a locked tag
When unlock is attempted with DX1234 or any wrong password
Then provisioning fails and no student_beacon_tags row is written
```

### Failure — DX-SMART after lock
```gherkin
Given a tag locked by OnTheBus
When DX-SMART tries to edit frames with DX1234
Then the vendor app cannot apply changes
```

### Failure — provision radio unavailable
```gherkin
Given Bluetooth adapter is absent or provision radio reports unavailable
When the driver opens Provision Tag
Then the UI shows BLE provisioning unavailable and does not start a GATT session
```

## Automation map

| Scenario | Test |
| :--- | :--- |
| Frame pack / xor / golden cmds | `apps/driver_app/android/app/src/test/java/com/schooltrack/driver_app/ble/Cp35FrameCodecTest.kt`, `Cp35CommandsTest.kt` |
| Fake transport unlock / wrong pwd / happy path | `apps/driver_app/android/app/src/test/java/com/schooltrack/driver_app/ble/Cp35GattClientTest.kt` |
| MethodChannel fake | `apps/driver_app/test/beacon_provision_service_test.dart` |
| Template + next minor | `src/lib/beaconProvision.test.ts` |
| Provision / revoke API auth | `src/app/api/driver/beacon/**/*.test.ts` |
| DX-SMART after lock | Manual pilot checklist ([boarding-technology.md](boarding-technology.md) §11) — not CI |
