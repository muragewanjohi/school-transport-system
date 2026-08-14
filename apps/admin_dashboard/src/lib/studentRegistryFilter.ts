export type RegistryIdFilter = "All" | "none" | string;

export function studentMatchesTripFilter(
  scheduleIds: string[] | null | undefined,
  tripFilter: RegistryIdFilter
): boolean {
  if (tripFilter === "All") return true;
  const ids = scheduleIds ?? [];
  if (tripFilter === "none") return ids.length === 0;
  return ids.includes(tripFilter);
}

export function studentMatchesRouteFilter(
  routeId: string | null | undefined,
  routeFilter: RegistryIdFilter
): boolean {
  if (routeFilter === "All") return true;
  if (routeFilter === "none") return !routeId;
  return routeId === routeFilter;
}

export function mergeStudentTripIds(input: {
  currentIds: string[];
  pickupScheduleIds: string[];
  dropoffScheduleIds: string[];
  slot: "pickup" | "dropoff";
  selectedId: string;
}): string[] {
  const pickup = input.currentIds.find((id) => input.pickupScheduleIds.includes(id)) || "";
  const dropoff = input.currentIds.find((id) => input.dropoffScheduleIds.includes(id)) || "";
  const nextPickup = input.slot === "pickup" ? input.selectedId : pickup;
  const nextDropoff = input.slot === "dropoff" ? input.selectedId : dropoff;
  return [nextPickup, nextDropoff].filter(Boolean);
}

export function studentMatchesRegistrySearch(input: {
  name: string;
  routeName: string;
  pickupName: string;
  dropoffName: string;
  nfc: string | null | undefined;
  grade: string | null | undefined;
  className: string | null | undefined;
  tripNames: string[];
  guardians: { name: string; phone: string }[];
  query: string;
}): boolean {
  const query = input.query.trim().toLowerCase();
  if (!query) return true;

  const matchesGuardians = input.guardians.some(
    (g) => g.name.toLowerCase().includes(query) || g.phone.includes(query)
  );

  return (
    input.name.toLowerCase().includes(query) ||
    input.routeName.toLowerCase().includes(query) ||
    input.pickupName.toLowerCase().includes(query) ||
    input.dropoffName.toLowerCase().includes(query) ||
    (input.nfc || "").toLowerCase().includes(query) ||
    (input.grade || "").toLowerCase().includes(query) ||
    (input.className || "").toLowerCase().includes(query) ||
    input.tripNames.some((name) => name.toLowerCase().includes(query)) ||
    matchesGuardians
  );
}
