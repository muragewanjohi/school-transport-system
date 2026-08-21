import { describe, expect, it } from "vitest";
import { normalizeKenyanPhone, phoneVariants } from "@/lib/kenyanPhone";

describe("normalizeKenyanPhone › local and E.164 inputs › +254", () => {
  it("Given a 07 number, When normalized, Then it becomes +2547", () => {
    expect(normalizeKenyanPhone("0712 345 678")).toBe("+254712345678");
  });

  it("Given +254, When normalized, Then it stays E.164", () => {
    expect(normalizeKenyanPhone("+254712345678")).toBe("+254712345678");
  });
});

describe("phoneVariants › Kenyan mobile › includes local and spaced forms", () => {
  it("Given +254712345678, When variants are built, Then 0-prefix and spaced forms are included", () => {
    expect(phoneVariants("+254712345678")).toEqual([
      "+254712345678",
      "+254 712 345 678",
      "0712345678",
      "712345678",
    ]);
  });
});
