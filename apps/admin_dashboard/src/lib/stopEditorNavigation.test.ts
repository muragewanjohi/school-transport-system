import { describe, expect, it } from "vitest";
import {
  friendlyStopSaveError,
  noticeFromStopsSearch,
  stopsPageAfterSave,
} from "@/lib/stopEditorNavigation";

describe("stopsPageAfterSave › successful create › Stops & Stages with created notice", () => {
  it("Given a successful create, When the next path is resolved, Then it is /routes/stops?created=1", () => {
    expect(stopsPageAfterSave("created")).toBe("/routes/stops?created=1");
  });

  it("Given created=1 on Stops & Stages, When the notice is resolved, Then the created message is shown", () => {
    expect(noticeFromStopsSearch("?created=1")).toBe("Stop created successfully.");
  });
});

describe("noticeFromStopsSearch › unknown query › no notice", () => {
  it("Given /routes/stops with no flag, When the notice is resolved, Then it is null", () => {
    expect(noticeFromStopsSearch("")).toBeNull();
    expect(noticeFromStopsSearch("?route=all")).toBeNull();
  });
});

describe("friendlyStopSaveError › duplicate sequence › operator message", () => {
  it("Given a unique_route_stop_sequence error, When it is mapped, Then a duplicate-save message is shown", () => {
    expect(
      friendlyStopSaveError(
        'duplicate key value violates unique constraint "unique_route_stop_sequence"',
      ),
    ).toMatch(/already exist/i);
  });
});
