import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/resendEmail", () => ({
  PUBLIC_INBOX_EMAIL: "info@onthebus.app",
  escapeHtml: (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;"),
  sendResendEmail: vi.fn(async () => true),
}));

import { POST } from "@/app/api/public-contact/route";
import { sendResendEmail } from "@/lib/resendEmail";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/public-contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/public-contact", () => {
  beforeEach(() => {
    vi.mocked(sendResendEmail).mockClear();
    vi.mocked(sendResendEmail).mockResolvedValue(true);
  });

  it("Given a valid contact payload, When submitted, Then emails info inbox", async () => {
    const res = await POST(
      jsonRequest({
        kind: "contact",
        full_name: "Ada Okello",
        email: "ada@example.com",
        subject: "Partnership",
        message: "We would like to learn more about OnTheBus for our schools.",
      })
    );
    expect(res.status).toBe(200);
    expect(sendResendEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendResendEmail).mock.calls[0][0]).toMatchObject({
      to: "info@onthebus.app",
      replyTo: "ada@example.com",
    });
  });

  it("Given a valid careers payload, When submitted, Then includes specialization", async () => {
    const res = await POST(
      jsonRequest({
        kind: "careers",
        full_name: "Jordan M.",
        email: "jordan@example.com",
        phone: "+254700000000",
        specialization: "Engineering",
        details: "Full-stack engineer interested in school safety products.",
      })
    );
    expect(res.status).toBe(200);
    const args = vi.mocked(sendResendEmail).mock.calls[0][0];
    expect(args.subject).toContain("Engineering");
    expect(args.text).toContain("Specialization: Engineering");
  });

  it("Given honeypot filled, When submitted, Then skips email", async () => {
    const res = await POST(
      jsonRequest({
        kind: "contact",
        full_name: "Bot",
        email: "bot@example.com",
        subject: "Hello",
        message: "This is long enough to pass validation.",
        company_website: "https://spam.example",
      })
    );
    expect(res.status).toBe(200);
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("Given invalid body, When submitted, Then returns 400", async () => {
    const res = await POST(
      jsonRequest({
        kind: "contact",
        full_name: "A",
        email: "not-an-email",
        subject: "x",
        message: "short",
      })
    );
    expect(res.status).toBe(400);
    expect(sendResendEmail).not.toHaveBeenCalled();
  });
});
