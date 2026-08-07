import { NextResponse } from "next/server";
import { z } from "zod";
import {
  escapeHtml,
  PUBLIC_INBOX_EMAIL,
  sendResendEmail,
} from "@/lib/resendEmail";

const contactSchema = z.object({
  kind: z.literal("contact"),
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(10).max(4000),
  company_website: z.string().max(200).optional(),
});

const careersSchema = z.object({
  kind: z.literal("careers"),
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  specialization: z.string().trim().min(2).max(120),
  details: z.string().trim().min(10).max(4000),
  company_website: z.string().max(200).optional(),
});

const bodySchema = z.discriminatedUnion("kind", [contactSchema, careersSchema]);

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the form and try again." },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Honeypot — bots fill hidden fields; humans leave them empty
  if (data.company_website && data.company_website.trim().length > 0) {
    return NextResponse.json({ ok: true });
  }

  if (data.kind === "contact") {
    const subject = `[Contact] ${data.subject}`;
    const text = [
      "New contact message from onthebus.app",
      "",
      `Name: ${data.full_name}`,
      `Email: ${data.email}`,
      `Subject: ${data.subject}`,
      "",
      data.message,
    ].join("\n");
    const html = `
      <h2>New contact message</h2>
      <p><strong>Name:</strong> ${escapeHtml(data.full_name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
      <p><strong>Subject:</strong> ${escapeHtml(data.subject)}</p>
      <p>${escapeHtml(data.message).replace(/\n/g, "<br/>")}</p>
    `;

    const sent = await sendResendEmail({
      to: PUBLIC_INBOX_EMAIL,
      subject,
      text,
      html,
      replyTo: data.email,
    });

    return NextResponse.json({
      ok: true,
      emailed: sent,
    });
  }

  const subject = `[Careers] ${data.specialization} — ${data.full_name}`;
  const text = [
    "New careers interest from onthebus.app",
    "",
    `Name: ${data.full_name}`,
    `Email: ${data.email}`,
    `Phone: ${data.phone?.trim() || "—"}`,
    `Specialization: ${data.specialization}`,
    "",
    data.details,
  ].join("\n");
  const html = `
    <h2>New careers interest</h2>
    <p><strong>Name:</strong> ${escapeHtml(data.full_name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(data.phone?.trim() || "—")}</p>
    <p><strong>Specialization:</strong> ${escapeHtml(data.specialization)}</p>
    <p>${escapeHtml(data.details).replace(/\n/g, "<br/>")}</p>
  `;

  const sent = await sendResendEmail({
    to: PUBLIC_INBOX_EMAIL,
    subject,
    text,
    html,
    replyTo: data.email,
  });

  return NextResponse.json({
    ok: true,
    emailed: sent,
  });
}
