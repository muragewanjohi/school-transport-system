import { describe, expect, it } from "vitest";
import {
  DEFAULT_BEACON_UUID,
  FACTORY_TAG_PASSWORD,
  PLAY_REVIEW_PROVISION_PIN,
  buildBeaconTemplate,
  decryptBeaconPassword,
  encryptBeaconPassword,
  generateBeaconDevicePassword,
  generateProvisionPin,
  hashProvisionPin,
  normalizeBeaconUuid,
  nextMinorValue,
  provisionPinConfigured,
  verifyProvisionPin,
} from "@/lib/beaconProvision";

describe("generateBeaconDevicePassword › length and alphabet › returns 6 chars", () => {
  it("Given default length, When generated, Then length is 6 and alphanumeric", () => {
    const pwd = generateBeaconDevicePassword();
    expect(pwd).toHaveLength(6);
    expect(pwd).toMatch(/^[A-Z0-9]+$/);
  });
});

describe("generateProvisionPin › format › six digits", () => {
  it("Given generateProvisionPin, When called, Then returns 6 numeric digits", () => {
    const pin = generateProvisionPin();
    expect(pin).toHaveLength(6);
    expect(pin).toMatch(/^\d{6}$/);
  });

  it("Given play-review constant, When checked, Then is 654321", () => {
    expect(PLAY_REVIEW_PROVISION_PIN).toBe("654321");
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
      provisionPinHash: hashProvisionPin("999999"),
    });
    expect(t.device_password).toBe("QWERTY");
    expect(t.is_factory_password).toBe(false);
    expect(t.minor).toBe(3);
    expect(t.provision_pin_required).toBe(true);
  });
});

describe("verifyProvisionPin › mandatory hash › denies unset and wrong", () => {
  it("Given no pin hash, When verifying any pin, Then rejected", () => {
    expect(verifyProvisionPin("123456", null)).toBe(false);
    expect(verifyProvisionPin("", null)).toBe(false);
    expect(provisionPinConfigured(null)).toBe(false);
  });

  it("Given hash for 123456, When wrong or empty pin, Then rejected; correct accepted", () => {
    const hash = hashProvisionPin("123456");
    expect(provisionPinConfigured(hash)).toBe(true);
    expect(verifyProvisionPin("000000", hash)).toBe(false);
    expect(verifyProvisionPin("", hash)).toBe(false);
    expect(verifyProvisionPin("123456", hash)).toBe(true);
  });
});

describe("nextMinorValue › bounds › clamps", () => {
  it("Given null, When nextMinorValue, Then 1", () => {
    expect(nextMinorValue(null)).toBe(1);
  });
});
