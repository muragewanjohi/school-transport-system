import { describe, expect, it } from "vitest";
import { recommendPlan } from "@/lib/pricingPlans";

describe("recommendPlan › School-sized needs › School", () => {
  it("Given 300 students, 6 buses, and 2 locations, When recommending, Then School", () => {
    const plan = recommendPlan({ students: 300, buses: 6, locations: 2 });
    expect(plan.id).toBe("school");
  });
});

describe("recommendPlan › one extra bus past School › Growth", () => {
  it("Given 300 students, 7 buses, and 3 locations, When recommending, Then Growth", () => {
    const plan = recommendPlan({ students: 300, buses: 7, locations: 3 });
    expect(plan.id).toBe("growth");
  });
});

describe("recommendPlan › needs above Growth caps › Enterprise", () => {
  it("Given 601 students, 11 buses, and 6 locations, When recommending, Then Enterprise", () => {
    const plan = recommendPlan({ students: 601, buses: 11, locations: 6 });
    expect(plan.id).toBe("enterprise");
  });
});

describe("recommendPlan › Starter-sized needs › Starter", () => {
  it("Given 100 students, 2 buses, and 1 location, When recommending, Then Starter", () => {
    const plan = recommendPlan({ students: 100, buses: 2, locations: 1 });
    expect(plan.id).toBe("starter");
  });
});
