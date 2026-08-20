import { describe, expect, it } from "vitest";
import {
  matchParentIdForGuardians,
  mergeParentChildRows,
  studentLinkedToParent,
} from "@/lib/parentChildren";

const PARENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("matchParentIdForGuardians", () => {
  it("first guardian phone matches a parent profile › returns that profile id", () => {
    expect(
      matchParentIdForGuardians(
        [{ name: "Elizaphan Murage", phone: "+254 724 511 201" }],
        [{ id: PARENT_ID, phone: "+254724511201" }]
      )
    ).toBe(PARENT_ID);
  });

  it("no matching phone › returns null", () => {
    expect(
      matchParentIdForGuardians(
        [{ name: "Other", phone: "+254700000000" }],
        [{ id: PARENT_ID, phone: "+254724511201" }]
      )
    ).toBeNull();
  });
});

describe("studentLinkedToParent", () => {
  it("parent_id matches › included even without guardian phone", () => {
    expect(
      studentLinkedToParent({
        parentId: PARENT_ID,
        parentPhone: "+254724511201",
        student: { parent_id: PARENT_ID, guardians: [] },
      })
    ).toBe(true);
  });

  it("parent_id is null but guardian phone matches › included", () => {
    expect(
      studentLinkedToParent({
        parentId: PARENT_ID,
        parentPhone: "+254724511201",
        student: {
          parent_id: null,
          guardians: [{ name: "Elizaphan Murage", phone: "0724511201" }],
        },
      })
    ).toBe(true);
  });

  it("different parent_id and phone › excluded", () => {
    expect(
      studentLinkedToParent({
        parentId: PARENT_ID,
        parentPhone: "+254724511201",
        student: {
          parent_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          guardians: [{ name: "Other", phone: "+254700000000" }],
        },
      })
    ).toBe(false);
  });
});

describe("mergeParentChildRows", () => {
  it("adds unlinked guardian matches without duplicating linked rows", () => {
    const linked = [{ id: "1", parent_id: PARENT_ID, guardians: [] }];
    const unlinked = [
      { id: "1", parent_id: PARENT_ID, guardians: [] },
      {
        id: "2",
        parent_id: null,
        guardians: [{ phone: "+254724511201" }],
      },
    ];
    const merged = mergeParentChildRows(linked, unlinked, PARENT_ID, "+254724511201");
    expect(merged).toHaveLength(2);
    expect(merged.map((row) => row.id)).toEqual(["1", "2"]);
  });
});
