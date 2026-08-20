import { describe, expect, it } from "vitest";
import {
  isMobileNavViewport,
  MOBILE_NAV_MAX_WIDTH_PX,
  shouldCloseMobileNavOnNavigate,
} from "@/lib/mobileNav";

describe("isMobileNavViewport", () => {
  it("treats the breakpoint and below as mobile", () => {
    expect(isMobileNavViewport(MOBILE_NAV_MAX_WIDTH_PX)).toBe(true);
    expect(isMobileNavViewport(MOBILE_NAV_MAX_WIDTH_PX - 1)).toBe(true);
    expect(isMobileNavViewport(375)).toBe(true);
  });

  it("treats widths above the breakpoint as desktop", () => {
    expect(isMobileNavViewport(MOBILE_NAV_MAX_WIDTH_PX + 1)).toBe(false);
    expect(isMobileNavViewport(1280)).toBe(false);
  });
});

describe("shouldCloseMobileNavOnNavigate", () => {
  it("closes only when mobile, open, and the path changed", () => {
    expect(
      shouldCloseMobileNavOnNavigate({
        isMobileViewport: true,
        isOpen: true,
        pathnameChanged: true,
      })
    ).toBe(true);
  });

  it("does not close on desktop", () => {
    expect(
      shouldCloseMobileNavOnNavigate({
        isMobileViewport: false,
        isOpen: true,
        pathnameChanged: true,
      })
    ).toBe(false);
  });

  it("does not close when already closed or path unchanged", () => {
    expect(
      shouldCloseMobileNavOnNavigate({
        isMobileViewport: true,
        isOpen: false,
        pathnameChanged: true,
      })
    ).toBe(false);
    expect(
      shouldCloseMobileNavOnNavigate({
        isMobileViewport: true,
        isOpen: true,
        pathnameChanged: false,
      })
    ).toBe(false);
  });
});
