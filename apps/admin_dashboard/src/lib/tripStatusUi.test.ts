import { describe, expect, it } from "vitest";
import { tripStatusIconColor, tripStatusStyles } from "@/lib/tripStatusUi";

describe("tripStatusStyles › Cancelled or Scheduled › readable on light grey", () => {
  it("Given Cancelled, When badge styles are resolved, Then ink is --text-primary on --bg-base", () => {
    const styles = tripStatusStyles("Cancelled");

    expect(styles.color).toBe("var(--text-primary)");
    expect(styles.background).toBe("var(--bg-base)");
    expect(styles.color.toLowerCase()).not.toBe("#fff");
  });

  it("Given Scheduled, When badge styles are resolved, Then ink is --text-primary not white", () => {
    const styles = tripStatusStyles("Scheduled");

    expect(styles.color).toBe("var(--text-primary)");
    expect(styles.background).toBe("var(--bg-base)");
    expect(tripStatusIconColor("Scheduled")).toBe("var(--text-primary)");
    expect(tripStatusIconColor("Cancelled")).toBe("var(--text-primary)");
  });
});

describe("tripStatusStyles › Active › keeps accent green", () => {
  it("Given Active, When badge styles are resolved, Then color is --accent-primary", () => {
    expect(tripStatusStyles("Active").color).toBe("var(--accent-primary)");
    expect(tripStatusIconColor("Active")).toBe("var(--accent-primary)");
  });
});
