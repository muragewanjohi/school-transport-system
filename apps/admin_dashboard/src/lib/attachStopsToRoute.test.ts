import { describe, expect, it } from "vitest";
import {
  orderedIdsAfterAttach,
  stopsAvailableToAttach,
} from "@/lib/attachStopsToRoute";

const routeA = [
  { id: "a1", route_id: "route-a", name: "Westlands Stage" },
  { id: "a2", route_id: "route-a", name: "Lavington Stage" },
];
const routeB = [
  { id: "b-start", route_id: "route-b", name: "School Start" },
  { id: "b-end", route_id: "route-b", name: "School End" },
];

describe("attachStopsToRoute › stops on other routes are available", () => {
  it("Given stages on Route A, When Route B is open, Then those stages appear in the attach list", () => {
    const available = stopsAvailableToAttach([...routeA, ...routeB], "route-b");
    expect(available.map((stop) => stop.id)).toEqual(["a1", "a2"]);
  });
});

describe("attachStopsToRoute › attached stages sit before the route end", () => {
  it("Given start and end stops, When two stages are attached, Then order is start, stages, end", () => {
    expect(orderedIdsAfterAttach(["b-start", "b-end"], ["a1", "a2"])).toEqual([
      "b-start",
      "a1",
      "a2",
      "b-end",
    ]);
  });
});
