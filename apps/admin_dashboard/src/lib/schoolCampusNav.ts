export const SCHOOL_CAMPUS_PATH = "/routes?tab=schools";
export const SCHOOL_CAMPUS_ICON_URL = "/assets/school-location-icon.png";

export function isSchoolCampusNavActive(pathname: string, tab: string | null): boolean {
  return pathname === "/routes" && tab === "schools";
}

export function isRoutesSectionNavActive(pathname: string, tab: string | null): boolean {
  if (!pathname.startsWith("/routes")) return false;
  return !isSchoolCampusNavActive(pathname, tab);
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
