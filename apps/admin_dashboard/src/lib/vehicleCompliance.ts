export const UNSET_VEHICLE_DATE = "2000-01-01";

export type ComplianceDueBand = "month" | "two_weeks" | "day" | "overdue";

export type VehicleComplianceAlert = {
  field: "next_service_date" | "insurance_expiry";
  band: ComplianceDueBand;
  message: string;
};

function parseDateOnly(iso: string): Date | null {
  const match = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

export function isUnsetVehicleDate(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return true;
  const parsed = parseDateOnly(value);
  if (!parsed) return true;
  return parsed.getUTCFullYear() <= 2000;
}

export function normalizeVehicleDate(value: string | null | undefined): string | null {
  if (isUnsetVehicleDate(value)) return null;
  return value!.slice(0, 10);
}

export function dateToFormValue(value: string | null | undefined): string {
  const normalized = normalizeVehicleDate(value);
  return normalized ?? UNSET_VEHICLE_DATE;
}

export function daysUntilDate(iso: string, today: Date): number | null {
  const due = parseDateOnly(iso);
  if (!due) return null;
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due.getTime() - start) / 86_400_000);
}

export function complianceDueBand(days: number): ComplianceDueBand | null {
  if (days < 0) return "overdue";
  if (days <= 1) return "day";
  if (days <= 14) return "two_weeks";
  if (days <= 30) return "month";
  return null;
}

function bandLabel(band: ComplianceDueBand): string {
  if (band === "month") return "in 1 month";
  if (band === "two_weeks") return "in 2 weeks";
  if (band === "day") return "in 1 day";
  return "overdue";
}

function alertForField(
  field: VehicleComplianceAlert["field"],
  iso: string | null | undefined,
  today: Date
): VehicleComplianceAlert | null {
  const normalized = normalizeVehicleDate(iso);
  if (!normalized) return null;
  const days = daysUntilDate(normalized, today);
  if (days === null) return null;
  const band = complianceDueBand(days);
  if (!band) return null;
  const subject = field === "insurance_expiry" ? "Insurance" : "Next service";
  const when = bandLabel(band);
  return {
    field,
    band,
    message:
      band === "overdue"
        ? `${subject} is overdue (${normalized})`
        : `${subject} due ${when} (${normalized})`,
  };
}

export function vehicleComplianceAlerts(
  vehicle: {
    notify_compliance_alerts?: boolean | null;
    next_service_date?: string | null;
    insurance_expiry?: string | null;
  },
  today: Date = new Date()
): VehicleComplianceAlert[] {
  if (!vehicle.notify_compliance_alerts) return [];
  return [
    alertForField("next_service_date", vehicle.next_service_date, today),
    alertForField("insurance_expiry", vehicle.insurance_expiry, today),
  ].filter((row): row is VehicleComplianceAlert => row !== null);
}

export function complianceAlertTone(band: ComplianceDueBand): "error" | "warning" {
  return band === "overdue" || band === "day" ? "error" : "warning";
}
