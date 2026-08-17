import { parseGeoPoint } from "@/lib/geoUtils";

export const STUDENT_PROFILE_COLUMNS =
  "id, name, route_id, nfc_card_hash, pickup_stop_id, dropoff_stop_id, schedule_ids, guardians, status, grade, class_name, address, pickup_location";

export type StudentMutationInput = {
  name?: string;
  route_id?: string;
  nfc_card_hash?: string | null;
  pickup_stop_id?: string | null;
  dropoff_stop_id?: string | null;
  schedule_ids?: string[];
  status?: "Present" | "Absent";
  guardians?: Array<{ name: string; phone: string }>;
  grade?: string | null;
  class_name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type StudentProfileRow = {
  guardians?: unknown;
  status?: string | null;
  address?: string | null;
  pickup_location?: unknown;
};

export function studentPickupLocationWkt(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): string | null {
  if (
    latitude === undefined ||
    latitude === null ||
    longitude === undefined ||
    longitude === null
  ) {
    return null;
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return `POINT(${longitude} ${latitude})`;
}

export function studentLocationWriteFields(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): { pickup_location: string } | Record<string, never> {
  const wkt = studentPickupLocationWkt(latitude, longitude);
  if (!wkt) return {};
  return { pickup_location: wkt };
}

export function studentDbWriteFields(data: StudentMutationInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.route_id !== undefined) payload.route_id = data.route_id;
  if (data.nfc_card_hash !== undefined) payload.nfc_card_hash = data.nfc_card_hash || null;
  if (data.guardians !== undefined) payload.guardians = data.guardians;
  if (data.status !== undefined) payload.status = data.status;
  if (data.grade !== undefined) payload.grade = data.grade || null;
  if (data.class_name !== undefined) payload.class_name = data.class_name || null;
  if (data.pickup_stop_id !== undefined) payload.pickup_stop_id = data.pickup_stop_id;
  if (data.dropoff_stop_id !== undefined) payload.dropoff_stop_id = data.dropoff_stop_id;
  if (data.schedule_ids !== undefined) payload.schedule_ids = data.schedule_ids;
  if (data.address !== undefined) payload.address = data.address || null;
  Object.assign(payload, studentLocationWriteFields(data.latitude, data.longitude));
  return payload;
}

export function mapStudentProfile<T extends StudentProfileRow>(student: T) {
  let parsedGuardians: unknown[] = [];
  if (student.guardians) {
    parsedGuardians =
      typeof student.guardians === "string"
        ? (JSON.parse(student.guardians) as unknown[])
        : (student.guardians as unknown[]);
  }
  const point = parseGeoPoint(student.pickup_location);
  return {
    ...student,
    guardians: parsedGuardians,
    status: student.status || "Present",
    address: student.address ?? null,
    latitude: point?.lat ?? null,
    longitude: point?.lng ?? null,
  };
}

export function studentApiErrorMessage(json: {
  error?: string;
  errors?: Record<string, string[] | undefined>;
}): string {
  if (json.error) return json.error;
  if (json.errors) {
    const parts = Object.entries(json.errors)
      .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].length > 0)
      .map(([field, msgs]) => `${field}: ${msgs.join(", ")}`);
    if (parts.length > 0) return parts.join("; ");
  }
  return "Unknown validation error";
}
