# DX-SMART CP35 vendor materials

Commercial support provides GATT UUID docs + Android demo source — **no AAR**.
OnTheBus uses a first-party GATT client (`Cp35GattClient` / `AndroidCp35Transport`).

## Evaluation notes (2026-09-18)

- Trip detection: standard BLE advertisement parsing only — no vendor SDK.
- Provision: FFE0 service; FFE1 notify; FFE2 command write; FFE3 password (within 30s). Default password `DX1234`.
- Do not copy `com.dxlq` demo packages into the Driver App.
- Keep vendor zip/rar local and gitignored (`apps/*.zip`, `apps/*.rar`, `vendor/dx-smart/*`).

## Local materials (gitignored)

- `apps/ibeacon.zip` — Android demo source (protocol reference)
- `apps/DX-CP35 Development&User Information.rar` — GATT + user manual

Do not commit proprietary binaries unless license explicitly allows.
