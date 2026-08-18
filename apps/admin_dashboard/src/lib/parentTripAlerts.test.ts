import { describe, expect, it } from "vitest";
import {
  alreadySentKind,
  evaluateCampusExitAlerts,
  evaluateStageApproachAlerts,
  etaSecondsToStop,
  formatCampusExitMessage,
  isOutsideCampus,
  shouldSendCampusExit,
  shouldSendStageApproach,
  shouldQueueParentSms,
  type ParentAlertKey,
} from "@/lib/parentTripAlerts";

const tripId = "trip-1";
const stops = [
  { id: "home-a", sequence_no: 1, duration_from_prev_seconds: 300 },
  { id: "home-b", sequence_no: 2, duration_from_prev_seconds: 240 },
];
const students = [
  {
    studentId: "stu-a",
    parentName: "Parent A",
    studentName: "Child A",
    stopId: "home-a",
    stopName: "Westlands Gate",
  },
  {
    studentId: "stu-b",
    parentName: "Parent B",
    studentName: "Child B",
    stopId: "home-b",
    stopName: "Riverside",
  },
];

describe("campus exit", () => {
  it("Given GPS still on campus, When evaluated, Then no campus-exit alerts fire", () => {
    expect(isOutsideCampus(40, 150)).toBe(false);
    expect(shouldSendCampusExit({ outsideCampus: false, alreadySent: false })).toBe(false);
    expect(
      evaluateCampusExitAlerts({
        tripId,
        outsideCampus: false,
        direction: "HOME_TO_SCHOOL",
        vehiclePlate: "KBC 123X",
        students,
        stops,
        alreadySent: [],
      })
    ).toEqual([]);
  });

  it("Given an in-progress trip whose GPS exits campus, When campus-exit alerts are evaluated, Then each trip student gets one ETA message", () => {
    const alerts = evaluateCampusExitAlerts({
      tripId,
      outsideCampus: true,
      direction: "HOME_TO_SCHOOL",
      vehiclePlate: "KBC 123X",
      students,
      stops,
      alreadySent: [],
      now: new Date("2026-08-18T04:00:00Z"),
    });
    expect(alerts).toHaveLength(2);
    expect(alerts[0]?.studentId).toBe("stu-a");
    expect(alerts[0]?.kind).toBe("campus_exit");
    expect(alerts[0]?.message).toContain("Child A");
    expect(alerts[0]?.message).toContain("Westlands Gate");
    expect(alerts[0]?.message).toContain("picked up");
    expect(alerts[0]?.durationMins).toBe(5);
    expect(alerts[1]?.studentId).toBe("stu-b");
    expect(alerts[1]?.durationMins).toBe(9);
  });

  it("Given a student already alerted for campus exit, When evaluated again, Then they are not alerted again", () => {
    const sent: ParentAlertKey[] = [{ studentId: "stu-a", tripId, kind: "campus_exit" }];
    expect(alreadySentKind(sent, "stu-a", tripId, "campus_exit")).toBe(true);
    const alerts = evaluateCampusExitAlerts({
      tripId,
      outsideCampus: true,
      direction: "HOME_TO_SCHOOL",
      vehiclePlate: "KBC 123X",
      students,
      stops,
      alreadySent: sent,
    });
    expect(alerts.map((a) => a.studentId)).toEqual(["stu-b"]);
  });

  it("Given a drop-off run, When formatted, Then the message uses dropped off", () => {
    const msg = formatCampusExitMessage({
      parentName: "Parent A",
      studentName: "Child A",
      vehiclePlate: "KBC 123X",
      stopName: "Westlands Gate",
      etaTime: "7:15 AM",
      durationMins: 12,
      direction: "SCHOOL_TO_HOME",
    });
    expect(msg).toContain("dropped off");
    expect(msg).toContain("Westlands Gate");
  });
});

describe("500 m stage approach", () => {
  it("Given a student whose stop is within 500 m and campus-exit already fired, When proximity is evaluated, Then that student gets one approaching message", () => {
    const sent: ParentAlertKey[] = [
      { studentId: "stu-a", tripId, kind: "campus_exit" },
      { studentId: "stu-b", tripId, kind: "campus_exit" },
    ];
    const alerts = evaluateStageApproachAlerts({
      tripId,
      students: [
        { ...students[0], distanceMeters: 420 },
        { ...students[1], distanceMeters: 900 },
      ],
      alreadySent: sent,
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.studentId).toBe("stu-a");
    expect(alerts[0]?.kind).toBe("proximity");
    expect(alerts[0]?.message).toContain("Westlands Gate");
  });

  it("Given a 500 m alert already sent for this trip, When proximity is evaluated again, Then it is not sent twice", () => {
    expect(shouldSendStageApproach({ withinApproachRing: true, alreadySent: true })).toBe(false);
    const alerts = evaluateStageApproachAlerts({
      tripId,
      students: [{ ...students[0], distanceMeters: 100 }],
      alreadySent: [{ studentId: "stu-a", tripId, kind: "proximity" }],
    });
    expect(alerts).toHaveLength(0);
  });
});

describe("etaSecondsToStop", () => {
  it("Given sequenced legs, When summed to the student stop, Then prior durations are included", () => {
    expect(etaSecondsToStop(stops, "home-a")).toBe(300);
    expect(etaSecondsToStop(stops, "home-b")).toBe(540);
  });
});

describe("shouldQueueParentSms", () => {
  it("Given SMS disabled, When an approach alert fires, Then SMS is not queued", () => {
    expect(shouldQueueParentSms(false)).toBe(false);
    expect(shouldQueueParentSms(undefined)).toBe(false);
  });

  it("Given the school enabled SMS, When an approach alert fires, Then SMS may be queued", () => {
    expect(shouldQueueParentSms(true)).toBe(true);
  });
});
