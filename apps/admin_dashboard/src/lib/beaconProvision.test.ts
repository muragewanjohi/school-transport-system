import { describe, expect, it } from "vitest";
import {
  DEFAULT_BEACON_UUID,
  FACTORY_TAG_PASSWORD,
  buildBeaconTemplate,
  decryptBeaconPassword,
  encryptBeaconPassword,
  generateBeaconDevicePassword,
  hashProvisionPin,
  normalizeBeaconUuid,
  nextMinorValue,
  verifyProvisionPin,
} from "@/lib/beaconProvision";

describe("generateBeaconDevicePassword › length and alphabet › returns 6 chars", () => {
  it("Given default length, When generated, Then length is 6 and alphanumeric", () => {
    const pwd = generateBeaconDevicePassword();
    expect(pwd).toHaveLength(6);
    expect(pwd).toMatch(/^[A-Z0-9]+$/);
  });
});

describe("encryptBeaconPassword › round-trip › decrypts original", () => {
  it("Given a plain password, When encrypted then decrypted, Then original is returned", () => {
    const enc = encryptBeaconPassword("AB12CD");
    expect(enc.startsWith("v1.")).toBe(true);
    expect(decryptBeaconPassword(enc)).toBe("AB12CD");
  });
});

describe("normalizeBeaconUuid › hyphenless paste › inserts hyphens", () => {
  it("Given A1B2…ABCDE without hyphens, When normalized, Then hyphenated UUID", () => {
    expect(normalizeBeaconUuid("A1B2C3D4E5F64789A0123456789ABCDE")).toBe(DEFAULT_BEACON_UUID);
  });
});

describe("buildBeaconTemplate › missing password › factory defaults", () => {
  it("Given empty tenant config, When template built, Then factory password and default UUID", () => {
    const t = buildBeaconTemplate({
      beaconUuid: null,
      nextMinor: null,
      encryptedPassword: null,
      provisionPinHash: null,
    });
    expect(t.uuid).toBe(DEFAULT_BEACON_UUID);
    expect(t.device_password).toBe(FACTORY_TAG_PASSWORD);
    expect(t.is_factory_password).toBe(true);
    expect(t.minor).toBe(1);
    expect(t.tx_dbm).toBe(-19.5);
    expect(t.provision_pin_required).toBe(false);
  });
});

describe("buildBeaconTemplate › encrypted tenant password › not factory", () => {
  it("Given encrypted password, When template built, Then decrypted password and flag false", () => {
    const enc = encryptBeaconPassword("QWERTY");
    const t = buildBeaconTemplate({
      beaconUuid: DEFAULT_BEACON_UUID,
      nextMinor: 3,
      encryptedPassword: enc,
      provisionPinHash: hashProvisionPin("9999"),
    });
    expect(t.device_password).toBe("QWERTY");
    expect(t.is_factory_password).toBe(false);
    expect(t.minor).toBe(3);
    expect(t.provision_pin_required).toBe(true);
  });
});

describe("verifyProvisionPin › optional hash › allows empty when unset", () => {
  it("Given no pin hash, When verifying any pin, Then allowed", () => {
    expect(verifyProvisionPin("anything", null)).toBe(true);
  });

  it("Given hash for 1234, When wrong pin, Then rejected", () => {
    const hash = hashProvisionPin("1234");
    expect(verifyProvisionPin("0000", hash)).toBe(false);
    expect(verifyProvisionPin("1234", hash)).toBe(true);
  });
});

describe("nextMinorValue › bounds › clamps", () => {
  it("Given null, When nextMinorValue, Then 1", () => {
    expect(nextMinorValue(null)).toBe(1);
  });
});
