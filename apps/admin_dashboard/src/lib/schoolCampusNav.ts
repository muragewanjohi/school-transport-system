export const SCHOOL_CAMPUS_PATH = "/routes?tab=schools";
export const SCHOOL_CAMPUS_ICON_URL = "/assets/school-location-icon.png";

export function isSchoolCampusNavActive(pathname: string, tab: string | null): boolean {
  return pathname === "/routes" && tab === "schools";
}

export function isRoutesSectionNavActive(pathname: string, tab: string | null): boolean {
  if (!pathname.startsWith("/routes")) return false;
  if (pathname.startsWith("/routes/today-trips")) return false;
  return !isSchoolCampusNavActive(pathname, tab);
}

export const TRIPS_HISTORY_PATH = "/trips/history";
export const TRIPS_OVERRIDE_PATH = "/trips/override";

export function isTripsSectionNavActive(pathname: string): boolean {
  return pathname.startsWith("/trips") || pathname.startsWith("/routes/today-trips");
}

export type RoutePlannerTab = "stops" | "schedules" | "schools";

/** Default detail tab on `/routes` (not School Campus). */
export const DEFAULT_ROUTE_PLANNER_TAB: RoutePlannerTab = "schedules";

/** Visual order of route detail tabs: Trips first, then stops. */
export const ROUTE_DETAIL_TAB_ORDER = ["schedules", "stops"] as const;

export function resolveRoutePlannerTab(tabParam: string | null): RoutePlannerTab {
  if (tabParam === "schools" || tabParam === "stops" || tabParam === "schedules") {
    return tabParam;
  }
  return DEFAULT_ROUTE_PLANNER_TAB;
}

type MapsSize = { width: number; height: number };
type MapsPoint = { x: number; y: number };

export function schoolCampusMapIcon(maps: {
  Size: new (width: number, height: number) => MapsSize;
  Point: new (x: number, y: number) => MapsPoint;
}): {
  url: string;
  scaledSize: MapsSize;
  origin: MapsPoint;
  anchor: MapsPoint;
} {
  return {
    url: SCHOOL_CAMPUS_ICON_URL,
    scaledSize: new maps.Size(44, 44),
    origin: new maps.Point(0, 0),
    anchor: new maps.Point(22, 22),
  };
}
