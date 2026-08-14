import { describe, expect, it } from "vitest";
import { contrastRatio, WCAG_AA_NORMAL_TEXT } from "@/lib/wcagContrast";

describe("admin console tokens › light surfaces › WCAG AA body text", () => {
  it("Given --text-primary on --bg-surface, When contrast is measured, Then ratio is at least 4.5:1", () => {
    expect(contrastRatio("#0F172A", "#ffffff")).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("Given --text-primary on --bg-base, When contrast is measured, Then ratio is at least 4.5:1", () => {
    expect(contrastRatio("#0F172A", "#F4F6FA")).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("Given --text-muted on --bg-surface and --bg-base, When contrast is measured, Then ratio is at least 4.5:1", () => {
    expect(contrastRatio("#475569", "#ffffff")).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(contrastRatio("#475569", "#F4F6FA")).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("Given white labels on --accent-fill, When contrast is measured, Then ratio is at least 4.5:1", () => {
    expect(contrastRatio("#ffffff", "#047857")).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("Given --accent-primary-ink on --bg-surface, When contrast is measured, Then ratio is at least 4.5:1", () => {
    expect(contrastRatio("#047857", "#ffffff")).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });
});
