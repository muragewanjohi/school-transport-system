import { describe, expect, it } from "vitest";
import {
  addExistingParentToGuardians,
  attachGuardianPhotos,
  defaultGuardianSourceMode,
  duplicateGuardianPhoneError,
  filterParentsByName,
  parentPhotoIndex,
  shouldShowExistingParentDropdown,
  validateGuardianEntries,
} from "@/lib/studentGuardians";

const parents = [
  { id: "p-1", name: "Jane Wanjiku", phone: "+254700111222", email: "jane@school.ke" },
  { id: "p-2", name: "Mary Kamau", phone: "+254711222333", email: "mary@school.ke" },
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
      [{ name: "Jane Wanjiku", phone: "+254700111222", email: "jane@school.ke" }],
      { name: "Jane Wanjiku", phone: "+254 700 111 222", email: "jane@school.ke" }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Two guardians cannot share the same phone number.");
    }
  });

  it("empty row present › auto-fills name, email, and canonical phone", () => {
    const result = addExistingParentToGuardians(
      [{ name: "", phone: "", email: "" }],
      { name: "Mary Kamau", phone: "+254 711 222 333", email: "mary@school.ke" }
    );
    expect(result).toEqual({
      ok: true,
      guardians: [
        { name: "Mary Kamau", phone: "+254711222333", email: "mary@school.ke" },
      ],
    });
  });
});

describe("validateGuardianEntries", () => {
  it("duplicate phones › returns the shared-phone message", () => {
    expect(
      validateGuardianEntries([
        { name: "Jane Wanjiku", phone: "+254700111222", email: "a@school.ke" },
        { name: "Jane Copy", phone: "+254700111222", email: "b@school.ke" },
      ])
    ).toBe("Two guardians cannot share the same phone number.");
  });

  it("missing email › returns email required", () => {
    expect(
      validateGuardianEntries([
        { name: "Jane Wanjiku", phone: "+254700111222", email: "" },
      ])
    ).toBe("Guardian 1 email is required");
  });
});

describe("attachGuardianPhotos", () => {
  it("matching parent phone › copies avatar_url onto photo_url", () => {
    const index = parentPhotoIndex([
      { phone: "+254 700 111 222", avatar_url: "https://cdn.example/jane.png" },
    ]);
    expect(
      attachGuardianPhotos(
        [{ name: "Jane", phone: "+254700111222", email: "jane@school.ke" }],
        index
      )
    ).toEqual([
      {
        name: "Jane",
        phone: "+254700111222",
        email: "jane@school.ke",
        photo_url: "https://cdn.example/jane.png",
      },
    ]);
  });

  it("no matching photo › photo_url is null for thumbnail fallback", () => {
    expect(
      attachGuardianPhotos(
        [{ name: "Jane", phone: "+254700111222", email: "jane@school.ke" }],
        new Map()
      )
    ).toEqual([
      {
        name: "Jane",
        phone: "+254700111222",
        email: "jane@school.ke",
        photo_url: null,
      },
    ]);
  });
});
