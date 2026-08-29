import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUTE_PLANNER_TAB,
  isRoutesSectionNavActive,
  isSchoolCampusNavActive,
  resolveRoutePlannerTab,
  ROUTE_DETAIL_TAB_ORDER,
  SCHOOL_CAMPUS_ICON_URL,
  SCHOOL_CAMPUS_PATH,
  schoolCampusMapIcon,
} from "@/lib/schoolCampusNav";

describe("school campus navigation", () => {
  it("School Campus path › is a top-level sidebar item not under Routes", () => {
    const sidebar = readFileSync(resolve(process.cwd(), "src/components/Sidebar.tsx"), "utf8");
    const submenuStart = sidebar.indexOf("{routesExpanded &&");
    const campusItemStart = sidebar.indexOf("{/* School Campus */}");
    const routesSubmenu = sidebar.slice(submenuStart, campusItemStart);

    expect(sidebar).toContain("href={SCHOOL_CAMPUS_PATH}");
    expect(sidebar).toContain("School Campus");
    expect(campusItemStart).toBeGreaterThan(submenuStart);
    expect(routesSubmenu).not.toContain("School Campus");
    expect(routesSubmenu).not.toContain("School Locations");
    expect(SCHOOL_CAMPUS_PATH).toBe("/routes?tab=schools");
  });

  it("/routes?tab=schools › School Campus is active and Routes is not", () => {
    expect(isSchoolCampusNavActive("/routes", "schools")).toBe(true);
    expect(isRoutesSectionNavActive("/routes", "schools")).toBe(false);
    expect(isRoutesSectionNavActive("/routes", null)).toBe(true);
    expect(isRoutesSectionNavActive("/routes/stops", null)).toBe(true);
  });

  it("campus map icon › uses the Transit Route Planner school asset", () => {
    class Size {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
    }
    class Point {
      x: number;
      y: number;
      constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
      }
    }

    const icon = schoolCampusMapIcon({ Size, Point });
    expect(icon.url).toBe(SCHOOL_CAMPUS_ICON_URL);
    expect(icon.url).toBe("/assets/school-location-icon.png");
    expect(icon.scaledSize).toEqual({ width: 44, height: 44 });
  });
});

describe("Route planner Trips tab first", () => {
  it("Given All Routes detail tabs, When they render, Then Trips is before Stops & Geofences", () => {
    expect(ROUTE_DETAIL_TAB_ORDER).toEqual(["schedules", "stops"]);
    const page = readFileSync(resolve(process.cwd(), "src/app/routes/page.tsx"), "utf8");
    const tripsBtn = page.indexOf("Trips ({routeSchedules.length})");
    const stopsBtn = page.indexOf("Stops & Geofences ({routeStops.length})");
    expect(tripsBtn).toBeGreaterThan(-1);
    expect(stopsBtn).toBeGreaterThan(tripsBtn);
  });

  it("Given /routes with no tab query, When the planner tab is resolved, Then Trips is selected", () => {
    expect(DEFAULT_ROUTE_PLANNER_TAB).toBe("schedules");
    expect(resolveRoutePlannerTab(null)).toBe("schedules");
    expect(resolveRoutePlannerTab("stops")).toBe("stops");
    expect(resolveRoutePlannerTab("schools")).toBe("schools");
  });
});
