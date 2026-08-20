import { describe, expect, it } from "vitest";
import {
  DEFAULT_ABSENT_CAMPUS_TEMPLATE,
  DEFAULT_ABSENT_STOP_TEMPLATE,
  classifyAbsentParentAlert,
  formatAbsentMessage,
  shouldNotifyAbsent,
  shouldQueueAbsentSms,
} from "@/lib/absentParentAlert";

describe("classifyAbsentParentAlert", () => {
  it("Given an in-progress trip, When a student is marked absent, Then it is a stop absent", () => {
    expect(
      classifyAbsentParentAlert({ tripStatus: "in_progress", direction: "HOME_TO_SCHOOL" })
    ).toBe("stop");
    expect(
      classifyAbsentParentAlert({ tripStatus: "in_progress", direction: "SCHOOL_TO_HOME" })
    ).toBe("stop");
  });

  it("Given a scheduled drop-off, When a student is marked absent at campus, Then it is a campus absent", () => {
    expect(
      classifyAbsentParentAlert({ tripStatus: "scheduled", direction: "SCHOOL_TO_HOME" })
    ).toBe("campus");
  });

  it("Given a scheduled pickup, When attendance becomes absent, Then no absent parent alert is classified", () => {
    expect(
      classifyAbsentParentAlert({ tripStatus: "scheduled", direction: "HOME_TO_SCHOOL" })
    ).toBeNull();
  });
});

describe("shouldNotifyAbsent", () => {
  it("Given notify_on_absent_stop is off, When a stop absent occurs, Then no parent notification is queued", () => {
    expect(
      shouldNotifyAbsent({
        kind: "stop",
        notifyOnAbsentStop: false,
        notifyOnAbsentCampus: true,
      })
    ).toBe(false);
  });

  it("Given notify_on_absent_campus is off, When a campus absent occurs, Then no parent notification is queued", () => {
    expect(
      shouldNotifyAbsent({
        kind: "campus",
        notifyOnAbsentStop: true,
        notifyOnAbsentCampus: false,
      })
    ).toBe(false);
  });

  it("Given both toggles on, When the matching event fires, Then the parent is notified", () => {
    expect(
      shouldNotifyAbsent({
        kind: "stop",
        notifyOnAbsentStop: true,
        notifyOnAbsentCampus: true,
      })
    ).toBe(true);
    expect(
      shouldNotifyAbsent({
        kind: "campus",
        notifyOnAbsentStop: true,
        notifyOnAbsentCampus: true,
      })
    ).toBe(true);
  });
});

describe("shouldQueueAbsentSms", () => {
  it("Given the event toggle is on and SMS is off, When an absent fires, Then only in-app is sent", () => {
    expect(
      shouldQueueAbsentSms({ notifyEnabled: true, smsNotificationsEnabled: false })
    ).toBe(false);
  });

  it("Given both the event toggle and SMS are on, When an absent fires, Then SMS is queued", () => {
    expect(
      shouldQueueAbsentSms({ notifyEnabled: true, smsNotificationsEnabled: true })
    ).toBe(true);
  });
});

describe("formatAbsentMessage", () => {
  it("Given a stop absent, When formatted, Then the bus has left stage copy is used", () => {
    const message = formatAbsentMessage({
      kind: "stop",
      studentName: "Amina",
      vehiclePlate: "KCA 123A",
      stopName: "Westlands Gate",
      time: "7:15 AM",
    });
    expect(message).toBe(
      "Bus KCA 123A has left stage Westlands Gate and Amina was marked absent at 7:15 AM."
    );
    expect(DEFAULT_ABSENT_STOP_TEMPLATE).toContain("{vehicle_plate}");
    expect(DEFAULT_ABSENT_STOP_TEMPLATE).toContain("{stop_name}");
  });

  it("Given a campus absent, When formatted, Then the left-school template is used", () => {
    const message = formatAbsentMessage({
      kind: "campus",
      studentName: "Amina",
      vehiclePlate: "KCA 123A",
      stopName: "Westlands Gate",
      time: "3:05 PM",
    });
    expect(message).toBe(
      "Bus KCA 123A: Amina was marked absent before the trip left school at 3:05 PM."
    );
    expect(DEFAULT_ABSENT_CAMPUS_TEMPLATE).toContain("{time}");
  });

  it("Given bus_number_plate and stage_name placeholders, When formatted, Then they resolve like plate and stop", () => {
    const message = formatAbsentMessage({
      kind: "stop",
      template:
        "bus{bus_number_plate} has left stage{stage_name} and {student_name} was marked absent at {time}",
      studentName: "Amina",
      vehiclePlate: "KCA123A",
      stopName: "Westlands",
      time: "7:15 AM",
    });
    expect(message).toBe(
      "busKCA123A has left stageWestlands and Amina was marked absent at 7:15 AM"
    );
  });
});
