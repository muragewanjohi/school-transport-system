import { describe, expect, it } from "vitest";
import {
  UNSET_VEHICLE_DATE,
  complianceDueBand,
  isUnsetVehicleDate,
  normalizeVehicleDate,
  vehicleComplianceAlerts,
} from "@/lib/vehicleCompliance";

const today = new Date(2026, 7, 14); // 14 Aug 2026 local

function isoInDays(days: number): string {
  const d = new Date(Date.UTC(2026, 7, 14 + days));
  return d.toISOString().slice(0, 10);
}

describe("vehicle date optional defaults", () => {
  it("year-2000 default is treated as unset", () => {
    expect(isUnsetVehicleDate(UNSET_VEHICLE_DATE)).toBe(true);
    expect(normalizeVehicleDate(UNSET_VEHICLE_DATE)).toBeNull();
    expect(normalizeVehicleDate("")).toBeNull();
    expect(
      vehicleComplianceAlerts({
        notify_compliance_alerts: true,
        next_service_date: UNSET_VEHICLE_DATE,
        insurance_expiry: UNSET_VEHICLE_DATE,
      }, today)
    ).toEqual([]);
  });
});

describe("vehicle compliance due alerts", () => {
  it("notify off › no alerts even when due in 14 days", () => {
    expect(
      vehicleComplianceAlerts({
        notify_compliance_alerts: false,
        next_service_date: isoInDays(14),
        insurance_expiry: isoInDays(1),
      }, today)
    ).toEqual([]);
  });

  it("notify on › 1 month, 2 weeks, and 1 day bands", () => {
    expect(complianceDueBand(30)).toBe("month");
    expect(complianceDueBand(14)).toBe("two_weeks");
    expect(complianceDueBand(1)).toBe("day");

    const month = vehicleComplianceAlerts(
      { notify_compliance_alerts: true, insurance_expiry: isoInDays(30) },
      today
    );
    expect(month[0]?.band).toBe("month");
    expect(month[0]?.message).toMatch(/Insurance due in 1 month/);

    const weeks = vehicleComplianceAlerts(
      { notify_compliance_alerts: true, next_service_date: isoInDays(14) },
      today
    );
    expect(weeks[0]?.band).toBe("two_weeks");
    expect(weeks[0]?.message).toMatch(/Next service due in 2 weeks/);

    const day = vehicleComplianceAlerts(
      { notify_compliance_alerts: true, insurance_expiry: isoInDays(1) },
      today
    );
    expect(day[0]?.band).toBe("day");
    expect(day[0]?.message).toMatch(/Insurance due in 1 day/);
  });

  it("notify on › overdue next service is flagged", () => {
    const overdue = vehicleComplianceAlerts(
      { notify_compliance_alerts: true, next_service_date: isoInDays(-3) },
      today
    );
    expect(overdue[0]?.band).toBe("overdue");
  });

  it("notify on › more than 30 days away produces no alert", () => {
    expect(
      vehicleComplianceAlerts(
        { notify_compliance_alerts: true, insurance_expiry: isoInDays(31) },
        today
      )
    ).toEqual([]);
  });
});
