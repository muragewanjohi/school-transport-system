import { describe, expect, it } from "vitest";
import {
  isMarketingPublicPath,
  isOnboardingBlockedSlug,
  isUnauthenticatedAllowedPath,
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

describe("isMarketingPublicPath › legal and landing › public without login", () => {
  it("Given /privacy /terms /delete-account, When checking marketing public, Then allowed", () => {
    expect(isMarketingPublicPath("/privacy")).toBe(true);
    expect(isMarketingPublicPath("/terms")).toBe(true);
    expect(isMarketingPublicPath("/delete-account")).toBe(true);
    expect(isMarketingPublicPath("/")).toBe(true);
  });

  it("Given company paths, When checking marketing public, Then allowed", () => {
    expect(isMarketingPublicPath("/about")).toBe(true);
    expect(isMarketingPublicPath("/careers")).toBe(true);
    expect(isMarketingPublicPath("/contact")).toBe(true);
  });

  it("Given /dashboard, When checking marketing public, Then blocked", () => {
    expect(isMarketingPublicPath("/dashboard")).toBe(false);
  });
});

describe("isUnauthenticatedAllowedPath › auth entry + legal › allowed", () => {
  it("Given login and legal paths, When checking unauthenticated access, Then allowed", () => {
    expect(isUnauthenticatedAllowedPath("/login")).toBe(true);
    expect(isUnauthenticatedAllowedPath("/reset-password")).toBe(true);
    expect(isUnauthenticatedAllowedPath("/privacy")).toBe(true);
    expect(isUnauthenticatedAllowedPath("/terms")).toBe(true);
    expect(isUnauthenticatedAllowedPath("/delete-account")).toBe(true);
    expect(isUnauthenticatedAllowedPath("/about")).toBe(true);
    expect(isUnauthenticatedAllowedPath("/careers")).toBe(true);
    expect(isUnauthenticatedAllowedPath("/contact")).toBe(true);
  });

  it("Given /fleet, When checking unauthenticated access, Then blocked", () => {
    expect(isUnauthenticatedAllowedPath("/fleet")).toBe(false);
  });
});
