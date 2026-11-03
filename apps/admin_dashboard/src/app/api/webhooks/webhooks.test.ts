import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Update = { patch: Record<string, unknown>; filters: Record<string, unknown> };
const updates: Update[] = [];
let knownIds = new Set<string>();

vi.mock("@/lib/supabaseAdmin", () => ({
  getServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== "otp_delivery_log") throw new Error(`Unexpected table ${table}`);
      return {
        update: (patch: Record<string, unknown>) => {
          const filters: Record<string, unknown> = {};
          const api = {
            eq: (col: string, val: unknown) => {
              filters[col] = val;
              return api;
            },
            select: async () => {
              const hit = knownIds.has(String(filters.provider_message_id));
              if (hit) updates.push({ patch, filters });
              return { data: hit ? [{ id: "row-1" }] : [], error: null };
            },
          };
          return api;
        },
      };
    },
  }),
}));

import { POST as atReport } from "@/app/api/webhooks/africastalking/delivery-report/route";
import { POST as resendHook } from "@/app/api/webhooks/resend/route";

const DLR_TOKEN = "dlr-test-token";
const RESEND_SECRET = `whsec_${Buffer.from("resend-test-key-0123456789").toString("base64")}`;

function atRequest(fields: Record<string, string>, token = DLR_TOKEN) {
  return new Request(`http://localhost/api/webhooks/africastalking/delivery-report?token=${token}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

function signedResendRequest(event: unknown, opts: { timestamp?: number; secret?: string } = {}) {
  const body = JSON.stringify(event);
  const id = "msg_test_1";
  const timestamp = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const secret = opts.secret ?? RESEND_SECRET;
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const sig = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${sig}`,
    },
    body,
  });
}

beforeEach(() => {
  process.env.AFRICASTALKING_DLR_TOKEN = DLR_TOKEN;
  process.env.RESEND_WEBHOOK_SECRET = RESEND_SECRET;
  updates.length = 0;
  knownIds = new Set(["ATXid_1", "em_1"]);
});

afterEach(() => {
  delete process.env.AFRICASTALKING_DLR_TOKEN;
  delete process.env.RESEND_WEBHOOK_SECRET;
});

describe("POST /api/webhooks/africastalking/delivery-report", () => {
  it("Given a logged SMS, When AT reports Success with the right token, Then the row becomes delivered", async () => {
    // Act
    const res = await atReport(atRequest({ id: "ATXid_1", status: "Success", phoneNumber: "+254701689463" }));

    // Assert
    expect(res.status).toBe(200);
    expect(updates).toEqual([
      {
        patch: expect.objectContaining({ status: "delivered", failure_reason: null }),
        filters: { provider: "africastalking", provider_message_id: "ATXid_1" },
      },
    ]);
  });

  it("Given a logged SMS, When AT reports Failed with UserInBlacklist, Then the row becomes undelivered with that reason", async () => {
    await atReport(atRequest({ id: "ATXid_1", status: "Failed", failureReason: "UserInBlacklist" }));

    expect(updates[0]?.patch).toMatchObject({ status: "undelivered", failure_reason: "UserInBlacklist" });
  });

  it("Given an intermediate status (Buffered), When AT reports it, Then nothing is updated", async () => {
    const res = await atReport(atRequest({ id: "ATXid_1", status: "Buffered" }));

    expect(res.status).toBe(200);
    expect(updates).toHaveLength(0);
  });

  it("Given an unknown message id (e.g. a trip alert SMS), When AT reports it, Then 200 with nothing updated", async () => {
    const res = await atReport(atRequest({ id: "ATXid_other", status: "Success" }));
    const body = (await res.json()) as { updated: number };

    expect(res.status).toBe(200);
    expect(body.updated).toBe(0);
  });

  it("Given a wrong token, When a report arrives, Then 401 and nothing is updated", async () => {
    const res = await atReport(atRequest({ id: "ATXid_1", status: "Success" }, "wrong"));

    expect(res.status).toBe(401);
    expect(updates).toHaveLength(0);
  });

  it("Given the token is not configured, When a report arrives, Then 503", async () => {
    delete process.env.AFRICASTALKING_DLR_TOKEN;

    const res = await atReport(atRequest({ id: "ATXid_1", status: "Success" }));

    expect(res.status).toBe(503);
  });

  it("Given a report without id, When it arrives, Then 400", async () => {
    const res = await atReport(atRequest({ status: "Success" }));

    expect(res.status).toBe(400);
  });
});

describe("POST /api/webhooks/resend", () => {
  it("Given a logged email, When a signed email.bounced arrives, Then the row becomes undelivered (bounced)", async () => {
    const res = await resendHook(signedResendRequest({ type: "email.bounced", data: { email_id: "em_1" } }));

    expect(res.status).toBe(200);
    expect(updates).toEqual([
      {
        patch: expect.objectContaining({ status: "undelivered", failure_reason: "bounced" }),
        filters: { provider: "resend", provider_message_id: "em_1" },
      },
    ]);
  });

  it("Given a logged email, When a signed email.delivered arrives, Then the row becomes delivered", async () => {
    await resendHook(signedResendRequest({ type: "email.delivered", data: { email_id: "em_1" } }));

    expect(updates[0]?.patch).toMatchObject({ status: "delivered" });
  });

  it("Given a bad signature, When a webhook arrives, Then 401 and nothing is updated", async () => {
    const wrongSecret = `whsec_${Buffer.from("some-other-key").toString("base64")}`;
    const res = await resendHook(
      signedResendRequest({ type: "email.delivered", data: { email_id: "em_1" } }, { secret: wrongSecret })
    );

    expect(res.status).toBe(401);
    expect(updates).toHaveLength(0);
  });

  it("Given a timestamp older than 5 minutes, When a webhook arrives, Then 401", async () => {
    const stale = Math.floor(Date.now() / 1000) - 6 * 60;
    const res = await resendHook(
      signedResendRequest({ type: "email.delivered", data: { email_id: "em_1" } }, { timestamp: stale })
    );

    expect(res.status).toBe(401);
  });

  it("Given an unhandled event type, When it arrives signed, Then 200 with nothing updated", async () => {
    const res = await resendHook(signedResendRequest({ type: "email.opened", data: { email_id: "em_1" } }));

    expect(res.status).toBe(200);
    expect(updates).toHaveLength(0);
  });

  it("Given the secret is not configured, When a webhook arrives, Then 503", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;

    const res = await resendHook(signedResendRequest({ type: "email.delivered", data: { email_id: "em_1" } }));

    expect(res.status).toBe(503);
  });
});
