import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readCss(): string {
  return readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
}

describe("admin theme tokens › form inputs › inset trip-summary fill", () => {
  it("Given light theme, When --input-bg is defined, Then it matches --bg-base #F4F6FA", () => {
    const css = readCss();
    const lightStart = css.indexOf(":root");
    const darkStart = css.indexOf("[data-theme=\"dark\"] {");
    const lightBlock = css.slice(lightStart, darkStart);

    expect(lightBlock).toMatch(/--bg-base:\s*#F4F6FA/i);
    expect(lightBlock).toMatch(/--input-bg:\s*#F4F6FA/i);
    expect(lightBlock).toMatch(/--text-primary:\s*#0F172A/i);
  });

  it("Given .form-input, When styles are declared, Then fill and ink use theme tokens not navy or white", () => {
    const css = readCss();
    const formStart = css.indexOf("/* Shared console form controls");
    expect(formStart).toBeGreaterThan(-1);
    const formBlock = css.slice(formStart, formStart + 1200);

    expect(formBlock).toContain("background: var(--input-bg)");
    expect(formBlock).toContain("color: var(--text-primary)");
    expect(formBlock).not.toMatch(/rgba\(\s*6,\s*9,\s*19/);
    expect(formBlock).not.toMatch(/color:\s*#fff/i);
  });

  it("Given Today's Trips page, When markup is inspected, Then it does not hardcode white text", () => {
    const page = readFileSync(resolve(process.cwd(), "src/components/TodayTripsConsole.tsx"), "utf8");
    expect(page).not.toMatch(/color:\s*["']#FFF["']/i);
    expect(page).not.toMatch(/rgba\(\s*6,\s*9,\s*19/);
  });
});

describe("admin theme tokens › roster cards › light surface with primary ink", () => {
  it("Given driver, conductor, and administrator pages, When card CSS is inspected, Then they use --bg-surface not navy fills", () => {
    const files = [
      "src/app/staff/drivers/page.tsx",
      "src/app/staff/conductors/page.tsx",
      "src/app/users/page.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/rgba\(\s*12,\s*17,\s*34/);
      expect(source, file).toContain("background: var(--bg-surface)");
      expect(source, file).toContain("color: var(--text-primary)");
    }
  });
});
