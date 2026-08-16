import { describe, expect, it } from "vitest";
import {
  addExistingParentToGuardians,
  defaultGuardianSourceMode,
  duplicateGuardianPhoneError,
  filterParentsByName,
  shouldShowExistingParentDropdown,
  validateGuardianEntries,
} from "@/lib/studentGuardians";

const parents = [
  { id: "p-1", name: "Jane Wanjiku", phone: "+254700111222" },
  { id: "p-2", name: "Mary Kamau", phone: "+254711222333" },
];

describe("defaultGuardianSourceMode", () => {
  it("Parents & Guardians section loads › Existing parent is selected", () => {
    expect(defaultGuardianSourceMode()).toBe("existing");
    expect(shouldShowExistingParentDropdown("existing")).toBe(true);
  });
});

describe("shouldShowExistingParentDropdown", () => {
  it("Add new parent is selected › registered-parent dropdown is hidden", () => {
    expect(shouldShowExistingParentDropdown("new")).toBe(false);
  });
});

describe("filterParentsByName", () => {
  it("operator types Jane › only Jane Wanjiku remains", () => {
    expect(filterParentsByName(parents, "Jane")).toEqual([parents[0]]);
  });

  it("empty query › returns all registered parents", () => {
    expect(filterParentsByName(parents, "  ")).toEqual(parents);
  });

  it("no name matches › returns an empty list", () => {
    expect(filterParentsByName(parents, "Otieno")).toEqual([]);
  });
});

describe("duplicateGuardianPhoneError", () => {
  it("two guardians share a phone › save is rejected", () => {
    expect(
      duplicateGuardianPhoneError([
        { phone: "+254 700 111 222" },
        { phone: "+254700111222" },
      ])
    ).toBe("Two guardians cannot share the same phone number.");
  });

  it("distinct phones › no duplicate error", () => {
    expect(
      duplicateGuardianPhoneError([
        { phone: "+254700111222" },
        { phone: "+254711222333" },
      ])
    ).toBeNull();
  });
});

describe("addExistingParentToGuardians", () => {
  it("same phone already on the form › does not add a second row", () => {
    const result = addExistingParentToGuardians(
      [{ name: "Jane Wanjiku", phone: "+254700111222" }],
      { name: "Jane Wanjiku", phone: "+254 700 111 222" }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Two guardians cannot share the same phone number.");
    }
  });

  it("empty row present › auto-fills name and canonical phone", () => {
    const result = addExistingParentToGuardians(
      [{ name: "", phone: "" }],
      { name: "Mary Kamau", phone: "+254 711 222 333" }
    );
    expect(result).toEqual({
      ok: true,
      guardians: [{ name: "Mary Kamau", phone: "+254711222333" }],
    });
  });
});

describe("validateGuardianEntries", () => {
  it("duplicate phones › returns the shared-phone message", () => {
    expect(
      validateGuardianEntries([
        { name: "Jane Wanjiku", phone: "+254700111222" },
        { name: "Jane Copy", phone: "+254700111222" },
      ])
    ).toBe("Two guardians cannot share the same phone number.");
  });
});
