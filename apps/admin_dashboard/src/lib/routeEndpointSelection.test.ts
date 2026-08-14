import { describe, expect, it } from "vitest";
import {
  inferEndpointFromStop,
  isMapVisible,
  mergeSchoolOptions,
  needsSchoolDropdown,
  resolveEndpointPayload,
} from "@/lib/routeEndpointSelection";

const schoolA = { id: "a", name: "Upper Campus", latitude: -1.2921, longitude: 36.8219 };
const schoolB = { id: "b", name: "Lower Campus", latitude: -1.3, longitude: 36.8 };

const schoolDraft = {
  source: "school" as const,
  schoolId: schoolA.id,
  searchLocation: "",
  latitude: 0,
  longitude: 0,
};

describe("routeEndpointSelection › from school default › map stays hidden", () => {
  it("Given From school, When visibility is resolved, Then the map is hidden", () => {
    expect(isMapVisible("school")).toBe(false);
  });

  it("Given one school, When From school is resolved, Then that campus is the start payload", () => {
    const result = resolveEndpointPayload(schoolDraft, [schoolA], "Start location");
    expect(result).toEqual({
      ok: true,
      value: { name: "Upper Campus", latitude: -1.2921, longitude: 36.8219 },
    });
  });
});

describe("routeEndpointSelection › multiple schools › dropdown required", () => {
  it("Given two campuses, When From school is used, Then a dropdown is required", () => {
    expect(needsSchoolDropdown([schoolA, schoolB])).toBe(true);
  });

  it("Given two campuses and no selection, When the payload is resolved, Then save is blocked", () => {
    const result = resolveEndpointPayload(
      { ...schoolDraft, schoolId: "" },
      [schoolA, schoolB],
      "Start location",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/select a school/i);
  });
});

describe("routeEndpointSelection › choose location › map pin becomes endpoint", () => {
  it("Given Choose location, When visibility is resolved, Then the map is shown", () => {
    expect(isMapVisible("custom")).toBe(true);
  });

  it("Given a captured pin, When the payload is resolved, Then that point is the start location", () => {
    const result = resolveEndpointPayload(
      {
        source: "custom",
        schoolId: "",
        searchLocation: "Westlands Stage",
        latitude: -1.2669,
        longitude: 36.8095,
      },
      [schoolA],
      "Start location",
    );
    expect(result).toEqual({
      ok: true,
      value: { name: "Westlands Stage", latitude: -1.2669, longitude: 36.8095 },
    });
  });
});

describe("mergeSchoolOptions and inferEndpointFromStop", () => {
  it("merges local schools that are not already in the API list", () => {
    expect(mergeSchoolOptions([schoolA], [schoolA, schoolB])).toEqual([schoolA, schoolB]);
  });

  it("uses From school when an existing stop matches a campus", () => {
    const inferred = inferEndpointFromStop(
      { name: "Upper Campus", latitude: -1.2921, longitude: 36.8219 },
      [schoolA, schoolB],
      schoolDraft,
    );
    expect(inferred.source).toBe("school");
    expect(inferred.schoolId).toBe("a");
  });
});
