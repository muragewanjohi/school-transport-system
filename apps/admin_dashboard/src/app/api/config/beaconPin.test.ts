import { describe, expect, it } from "vitest";
import {
  generateProvisionPin,
  hashProvisionPin,
  sanitizeTenantConfigForClient,
} from "@/lib/beaconProvision";

describe("sanitizeTenantConfigForClient › strips secrets", () => {
  it("Given hashed PIN and encrypted password, When sanitized, Then only configured flag remains", () => {
    const out = sanitizeTenantConfigForClient({
      school_name: "Test",
      beacon_provision_pin_hash: hashProvisionPin("123456"),
      beacon_device_password_enc: "v1.secret",
      beacon_uuid: "A1B2C3D4-E5F6-4789-A012-3456789ABCDE",
    });
    expect(out.beacon_provision_pin_hash).toBeUndefined();
    expect(out.beacon_device_password_enc).toBeUndefined();
    expect(out.beacon_provision_pin_configured).toBe(true);
    expect(out.school_name).toBe("Test");
  });

  it("Given stored Mapbox token, When sanitized, Then token is omitted", () => {
    const out = sanitizeTenantConfigForClient({
      school_name: "Test",
      mapbox_access_token: "pk.ey.secret",
    });
    expect(out.mapbox_access_token).toBeUndefined();
    expect(out.school_name).toBe("Test");
  });
});

describe("config rotate payload shape › pin length", () => {
  it("Given generateProvisionPin, When used for rotate response, Then six digits", () => {
    expect(generateProvisionPin()).toMatch(/^\d{6}$/);
  });
});
