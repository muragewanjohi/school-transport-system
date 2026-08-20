export const DROPOFF_DIRECTION = "SCHOOL_TO_HOME";

export const DROPOFF_START_BLOCKED_MESSAGE =
  "Board or mark absent every student before starting this drop-off trip.";

const RESOLVED_ATTENDANCE = new Set(["boarded", "absent", "no_show"]);

export type ManifestAttendanceRow = {
  attendance?: string | null;
};

export type ManifestAttendanceTally = {
  students_count: number;
  pending_count: number;
  boarded_count: number;
  absent_count: number;
};

export function isManifestResolved(attendance: string | null | undefined): boolean {
  return RESOLVED_ATTENDANCE.has((attendance ?? "pending").toString());
}

export function isDropoffDirection(direction: string | null | undefined): boolean {
  return (direction ?? "").toString() === DROPOFF_DIRECTION;
}

/** Empty roster is ready. Every row must be boarded, absent, or no_show. */
export function dropoffTripReadyToStart(manifests: ManifestAttendanceRow[]): boolean {
  return manifests.every((row) => isManifestResolved(row.attendance));
}

export function tallyManifestAttendance(manifests: ManifestAttendanceRow[]): ManifestAttendanceTally {
  const tally: ManifestAttendanceTally = {
    students_count: manifests.length,
    pending_count: 0,
    boarded_count: 0,
    absent_count: 0,
  };
  for (const row of manifests) {
    const attendance = (row.attendance ?? "pending").toString();
    if (attendance === "boarded") tally.boarded_count += 1;
    else if (attendance === "absent" || attendance === "no_show") tally.absent_count += 1;
    else tally.pending_count += 1;
  }
  return tally;
}

export function shouldBlockDropoffStart(input: {
  direction: string | null | undefined;
  manifests: ManifestAttendanceRow[];
}): boolean {
  return isDropoffDirection(input.direction) && !dropoffTripReadyToStart(input.manifests);
}
