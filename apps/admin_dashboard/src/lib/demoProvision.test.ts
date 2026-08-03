import { describe, expect, it } from "vitest";
import {
  DEMO_DEFAULT_EXPIRY_DAYS,
  buildDemoSlug,
  normalizeDemoPhone,
  slugifySchoolName,
} from "@/lib/demoProvision";

describe("buildDemoSlug › Nairobi School › returns nairobi-school-demo", () => {
  it("Given school name Nairobi School, When slug is built, Then it is nairobi-school-demo and ≤48 chars", () => {
    // Arrange
    const schoolName = "Nairobi School";

    // Act
    const slug = buildDemoSlug(schoolName);

    // Assert
    expect(slug).toBe("nairobi-school-demo");
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith("-demo")).toBe(true);
  });
});

describe("buildDemoSlug › attempt 2 › returns nairobi-school-2-demo", () => {
  it("Given Nairobi School and attempt 2, When slug is built, Then numeric infix precedes -demo", () => {
    expect(buildDemoSlug("Nairobi School", 2)).toBe("nairobi-school-2-demo");
  });
});

describe("buildDemoSlug › punctuation only › returns school-demo", () => {
  it("Given punctuation-only name, When slug is built, Then fallback is school-demo", () => {
    expect(slugifySchoolName("!!!")).toBe("school");
    expect(buildDemoSlug("!!!")).toBe("school-demo");
  });
});

describe("normalizeDemoPhone › leading 0 › converts to +254", () => {
  it("Given 0712345678, When normalized, Then +254712345678", () => {
    expect(normalizeDemoPhone("0712345678")).toBe("+254712345678");
  });

  it("Given spaced local format, When normalized, Then E.164 without spaces", () => {
    expect(normalizeDemoPhone("0712 345 678")).toBe("+254712345678");
  });
});

describe("normalizeDemoPhone › E.164 › unchanged", () => {
  it("Given +254712345678, When normalized, Then unchanged", () => {
    expect(normalizeDemoPhone("+254712345678")).toBe("+254712345678");
  });
});

describe("DEMO_DEFAULT_EXPIRY_DAYS › constant › is 14", () => {
  it("Given confirm without custom expiry, When default is used, Then window is 14 days", () => {
    expect(DEMO_DEFAULT_EXPIRY_DAYS).toBe(14);
  });
});
