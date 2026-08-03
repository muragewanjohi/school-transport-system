import { describe, expect, it } from "vitest";
import {
  isOnboardingBlockedSlug,
  isValidTenantSlug,
} from "@/lib/tenantHost";

describe("isOnboardingBlockedSlug › *-demo and demo › blocked; real slug allowed", () => {
  it("Given acme-academy-demo, When onboarding validation runs, Then blocked", () => {
    expect(isOnboardingBlockedSlug("acme-academy-demo")).toBe(true);
    expect(isValidTenantSlug("acme-academy-demo")).toBe(false);
  });

  it("Given demo, When onboarding validation runs, Then blocked", () => {
    expect(isOnboardingBlockedSlug("demo")).toBe(true);
    expect(isValidTenantSlug("demo")).toBe(false);
  });

  it("Given acme-academy, When onboarding validation runs, Then allowed", () => {
    expect(isOnboardingBlockedSlug("acme-academy")).toBe(false);
    expect(isValidTenantSlug("acme-academy")).toBe(true);
  });
});

describe("isOnboardingBlockedSlug › www › blocked", () => {
  it("Given www, When onboarding validation runs, Then blocked", () => {
    expect(isOnboardingBlockedSlug("www")).toBe(true);
    expect(isValidTenantSlug("www")).toBe(false);
  });
});
