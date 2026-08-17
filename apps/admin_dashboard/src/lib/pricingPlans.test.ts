import { describe, expect, it } from "vitest";
import { recommendPlan, upgradePlanAction, usageAgainstPlan } from "@/lib/pricingPlans";

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

describe("recommendPlan › billing roster that fits School › School", () => {
  it("Given 214 students, 5 buses, and 1 location, When resolving current plan, Then School at 10,000 with 300/6/3 caps", () => {
    const plan = recommendPlan({ students: 214, buses: 5, locations: 1 });
    expect(plan.id).toBe("school");
    expect(plan.name).toBe("School");
    expect(plan.monthlyKes).toBe(10000);
    expect(plan.maxStudents).toBe(300);
    expect(plan.maxBuses).toBe(6);
    expect(plan.maxLocations).toBe(3);
  });
});

describe("usageAgainstPlan › School caps › actuals formatted", () => {
  it("Given School plan and 214 students, When formatting usage, Then 214 / 300 and not over cap", () => {
    const plan = recommendPlan({ students: 214, buses: 5, locations: 1 });
    const usage = usageAgainstPlan(plan, { students: 214, buses: 5, locations: 1 });
    expect(usage.students.display).toBe("214 / 300");
    expect(usage.students.over).toBe(false);
    expect(usage.buses.display).toBe("5 / 6");
    expect(usage.locations.display).toBe("1 / 3");
  });
});

describe("usageAgainstPlan › Starter cap exceeded › over", () => {
  it("Given Starter plan and 120 students, When comparing usage, Then students are over cap", () => {
    const starter = recommendPlan({ students: 1, buses: 1, locations: 1 });
    const usage = usageAgainstPlan(starter, { students: 120, buses: 1, locations: 1 });
    expect(starter.id).toBe("starter");
    expect(usage.students.over).toBe(true);
    expect(usage.students.display).toBe("120 / 100");
  });
});

describe("upgradePlanAction › School plan › Upgrade plan", () => {
  it("Given School, When resolving upgrade, Then label is Upgrade plan", () => {
    expect(upgradePlanAction("school")).toEqual({
      label: "Upgrade plan",
      href: "/pricing",
    });
  });
});
