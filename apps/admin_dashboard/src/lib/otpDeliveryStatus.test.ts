import { describe, expect, it } from "vitest";
import {
  deliveryForPhone,
  latestDeliveryPerProfile,
  mapAfricasTalkingReport,
  mapResendEvent,
  maskPhone,
  otpDeliveryLabel,
  type OtpDeliveryRow,
} from "@/lib/otpDeliveryStatus";

function row(overrides: Partial<OtpDeliveryRow>): OtpDeliveryRow {
  return {
    profile_id: "p1",
    channel: "sms",
    status: "sent",
    failure_reason: null,
    destination: "+254******463",
    created_at: "2026-11-03T07:42:00.000Z",
    ...overrides,
  };
}

describe("maskPhone", () => {
  it("Given a full Kenyan number, When masked, Then only the prefix and last 3 digits remain", () => {
    expect(maskPhone("+254701689463")).toBe("+254******463");
  });

  it("Given a very short value, When masked, Then nothing is revealed", () => {
    expect(maskPhone("12345")).toBe("***");
  });
});

describe("mapAfricasTalkingReport", () => {
  it("Given Success, When mapped, Then delivered", () => {
    expect(mapAfricasTalkingReport("Success")).toEqual({ status: "delivered", failureReason: null });
  });

  it("Given Failed with a reason, When mapped, Then undelivered with that reason", () => {
    expect(mapAfricasTalkingReport("Failed", "UserInBlacklist")).toEqual({
      status: "undelivered",
      failureReason: "UserInBlacklist",
    });
  });

  it("Given Rejected without a reason, When mapped, Then the status is used as reason", () => {
    expect(mapAfricasTalkingReport("Rejected", "")).toEqual({ status: "undelivered", failureReason: "Rejected" });
  });

  it.each(["Sent", "Submitted", "Buffered"])("Given intermediate %s, When mapped, Then ignored", (status) => {
    expect(mapAfricasTalkingReport(status)).toBeNull();
  });
});

describe("mapResendEvent", () => {
  it.each([
    ["email.delivered", { status: "delivered", failureReason: null }],
    ["email.bounced", { status: "undelivered", failureReason: "bounced" }],
    ["email.complained", { status: "delivered", failureReason: "marked as spam" }],
  ])("Given %s, When mapped, Then the matching status", (type, expected) => {
    expect(mapResendEvent(type)).toEqual(expected);
  });

  it("Given an unhandled event, When mapped, Then ignored", () => {
    expect(mapResendEvent("email.opened")).toBeNull();
  });
});

describe("latestDeliveryPerProfile / deliveryForPhone", () => {
  it("Given several attempts per profile in any order, When reduced, Then the newest per profile wins", () => {
    const older = row({ created_at: "2026-11-03T07:00:00.000Z", status: "failed" });
    const newer = row({ created_at: "2026-11-03T08:00:00.000Z", status: "delivered" });
    const other = row({ profile_id: "p2" });

    const latest = latestDeliveryPerProfile([newer, other, older]);

    expect(latest.get("p1")).toBe(newer);
    expect(latest.get("p2")).toBe(other);
  });

  it("Given a guardian phone in local format, When looked up, Then the profile row with the same number matches", () => {
    const caroline = row({ phone: "+254701689463" });

    expect(deliveryForPhone([caroline], "0701 689 463")).toBe(caroline);
    expect(deliveryForPhone([caroline], "+254700000000")).toBeNull();
  });
});

describe("otpDeliveryLabel", () => {
  const now = new Date("2026-11-03T12:00:00.000Z");

  it("Given an undelivered SMS, When labelled, Then error tone with reason", () => {
    const label = otpDeliveryLabel(row({ status: "undelivered", failure_reason: "UserInBlacklist" }), now);

    expect(label.tone).toBe("error");
    expect(label.text).toMatch(/^Login code: SMS not delivered · UserInBlacklist · /);
  });

  it("Given a delivered email, When labelled, Then success tone", () => {
    const label = otpDeliveryLabel(row({ channel: "email", status: "delivered", destination: "j***@gmail.com" }), now);

    expect(label.tone).toBe("success");
    expect(label.text).toMatch(/^Login code: Email delivered · /);
    expect(label.title).toContain("j***@gmail.com");
  });

  it("Given an SMS awaiting a report, When labelled, Then muted tone", () => {
    expect(otpDeliveryLabel(row({ status: "sent" }), now).tone).toBe("muted");
  });
});
