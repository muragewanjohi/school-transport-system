import { escapeHtml, sendResendEmail } from "@/lib/resendEmail";
import type { DemoProvisionResult } from "@/lib/demoProvision";
import { buildGoLiveNotifyEmail, goLiveNotifyEmail } from "@/lib/demoGoLive";

export async function notifyRequesterReceived(payload: {
  full_name: string;
  school_name: string;
  email: string;
  preferred_time: string;
}): Promise<boolean> {
  const firstName = payload.full_name.trim().split(/\s+/)[0] || payload.full_name;
  const subject = "We've received your demo request";
  const text = [
    `Hi ${firstName},`,
    ``,
    `Thanks for requesting an OnTheBus demo for ${payload.school_name}.`,
    ``,
    `We've received your request and our team will review it shortly.`,
    `Preferred timing: ${payload.preferred_time}.`,
    ``,
    `Once approved, we'll email you your demo school URL and login details.`,
    `This usually takes up to one business day.`,
    ``,
    `Questions in the meantime? Reply to this email or write to sales@onthebus.app.`,
    ``,
    `— The OnTheBus team`,
  ].join("\n");

  const html = `
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>Thanks for requesting an OnTheBus demo for <strong>${escapeHtml(payload.school_name)}</strong>.</p>
    <p>We've received your request and our team will review it shortly.<br />
    Preferred timing: <strong>${escapeHtml(payload.preferred_time)}</strong>.</p>
    <p>Once approved, we'll email you your demo school URL and login details.
    This usually takes up to one business day.</p>
    <p>Questions in the meantime? Reply to this email or write to
    <a href="mailto:sales@onthebus.app">sales@onthebus.app</a>.</p>
    <p>— The OnTheBus team</p>
  `.trim();

  return sendResendEmail({
    to: payload.email,
    subject,
    text,
    html,
    from: process.env.DEMO_REQUESTS_FROM_EMAIL || undefined,
  });
}

export async function notifySales(payload: {
  full_name: string;
  role: string;
  school_name: string;
  country: string;
  city: string;
  phone: string;
  email?: string;
  fleet_size: string;
  preferred_time: string;
  notes?: string;
}): Promise<void> {
  const to = process.env.DEMO_REQUESTS_NOTIFY_EMAIL || "sales@onthebus.app";
  const body = [
    `New OnTheBus demo request`,
    ``,
    `Name: ${payload.full_name}`,
    `Role: ${payload.role}`,
    `School: ${payload.school_name}`,
    `Country: ${payload.country}`,
    `City: ${payload.city}`,
    `Phone/WhatsApp: ${payload.phone}`,
    `Email: ${payload.email || "—"}`,
    `Fleet size: ${payload.fleet_size}`,
    `Preferred time: ${payload.preferred_time}`,
    `Notes: ${payload.notes || "—"}`,
    ``,
    `Status: pending — confirm in /schools?tab=demos to provision the demo store.`,
  ].join("\n");

  await sendResendEmail({
    to,
    subject: `Demo request: ${payload.school_name} (${payload.city})`,
    text: body,
    from: process.env.DEMO_REQUESTS_FROM_EMAIL || undefined,
  });
}

/** Emails demo store access details to the lead's work email (never the synthetic admin address). */
export async function notifyDemoReady(
  params: DemoProvisionResult & { fullName: string; email: string; schoolName: string }
): Promise<boolean> {
  const firstName = params.fullName.trim().split(/\s+/)[0] || params.fullName;
  const expiresLabel = new Date(params.expiresAt).toUTCString();
  const subject = "Your OnTheBus demo school is ready";
  const text = [
    `Hi ${firstName},`,
    ``,
    `Your demo school for ${params.schoolName} is ready.`,
    ``,
    `School URL: ${params.schoolUrl}`,
    `Expires: ${expiresLabel}`,
    ``,
    `Dashboard admin login`,
    `Email: ${params.adminEmail}`,
    `Password: ${params.adminPassword}`,
    ``,
    `Flutter parent & driver apps`,
    `Phone: ${params.phone}`,
    `Request a fresh OTP from the app. Each code expires after 15 minutes.`,
    ``,
    `BLE Provision PIN (Driver App → Provision Tag)`,
    `PIN: ${params.provisionPin}`,
    `Share this PIN only with staff who configure student BLE tags. School admins can rotate it under Config.`,
    ``,
    `If you did not request this, you can ignore this email.`,
    ``,
    `— The OnTheBus team`,
  ].join("\n");

  const html = `
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>Your demo school for <strong>${escapeHtml(params.schoolName)}</strong> is ready.</p>
    <p><strong>School URL:</strong> <a href="${escapeHtml(params.schoolUrl)}">${escapeHtml(params.schoolUrl)}</a><br />
    <strong>Expires:</strong> ${escapeHtml(expiresLabel)}</p>
    <p><strong>Dashboard admin login</strong><br />
    Email: <code>${escapeHtml(params.adminEmail)}</code><br />
    Password: <code>${escapeHtml(params.adminPassword)}</code></p>
    <p><strong>Flutter parent &amp; driver apps</strong><br />
    Phone: <code>${escapeHtml(params.phone)}</code><br />
    Request a fresh OTP from the app. Each code expires after 15 minutes.</p>
    <p><strong>BLE Provision PIN</strong> (Driver App → Provision Tag)<br />
    PIN: <code>${escapeHtml(params.provisionPin)}</code><br />
    Share this PIN only with staff who configure student BLE tags. School admins can rotate it under Config.</p>
    <p>If you did not request this, you can ignore this email.</p>
    <p>— The OnTheBus team</p>
  `.trim();

  return sendResendEmail({
    to: params.email,
    subject,
    text,
    html,
    from: process.env.DEMO_REQUESTS_FROM_EMAIL || undefined,
  });
}

/** Real-school onboard: Provision PIN (Supabase invite is sent separately). */
export async function notifySchoolProvisionPin(params: {
  fullName: string;
  email: string;
  schoolName: string;
  schoolUrl: string;
  provisionPin: string;
  isDemo: boolean;
}): Promise<boolean> {
  const firstName = params.fullName.trim().split(/\s+/)[0] || params.fullName;
  const subject = `OnTheBus BLE Provision PIN for ${params.schoolName}`;
  const text = [
    `Hi ${firstName},`,
    ``,
    `Your school ${params.schoolName} is set up on OnTheBus.`,
    `School URL: ${params.schoolUrl}`,
    ``,
    `BLE Provision PIN (Driver App → Provision Tag): ${params.provisionPin}`,
    ``,
    `Drivers and conductors need this PIN to load the beacon template and lock student tags.`,
    `Only school admins can rotate the PIN under Config in the web console.`,
    `You should also receive a separate email to set your admin password.`,
    ``,
    `— The OnTheBus team`,
  ].join("\n");

  const html = `
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>Your school <strong>${escapeHtml(params.schoolName)}</strong> is set up on OnTheBus.</p>
    <p><strong>School URL:</strong> <a href="${escapeHtml(params.schoolUrl)}">${escapeHtml(params.schoolUrl)}</a></p>
    <p><strong>BLE Provision PIN</strong> (Driver App → Provision Tag): <code>${escapeHtml(params.provisionPin)}</code></p>
    <p>Drivers and conductors need this PIN to load the beacon template and lock student tags.
    Only school admins can rotate the PIN under <strong>Config</strong> in the web console.</p>
    <p>You should also receive a separate email to set your admin password.</p>
    <p>— The OnTheBus team</p>
  `.trim();

  return sendResendEmail({
    to: params.email,
    subject,
    text,
    html,
  });
}

export async function notifyGoLiveRequested(payload: {
  schoolName: string;
  slug: string;
  tenantId: string;
  demoExpiresAt: string | null;
  leadName: string;
  leadEmail: string | null;
  leadPhone: string | null;
  leadCity: string | null;
  requestedByName: string;
  requestedByEmail: string;
}): Promise<boolean> {
  const { subject, text } = buildGoLiveNotifyEmail(payload);
  return sendResendEmail({
    to: goLiveNotifyEmail(),
    subject,
    text,
    from: process.env.DEMO_REQUESTS_FROM_EMAIL || undefined,
  });
}

export async function notifyRequesterCompleted(params: {
  fullName: string;
  email: string;
  schoolName: string;
}): Promise<boolean> {
  const firstName = params.fullName.trim().split(/\s+/)[0] || params.fullName;
  const subject = "Thanks for completing your OnTheBus demo";
  const text = [
    `Hi ${firstName},`,
    ``,
    `Thanks for walking through OnTheBus with us for ${params.schoolName}.`,
    ``,
    `Your temporary demo school has been closed.`,
    `If you're ready to set up your school, or have questions about pricing and rollout,`,
    `reply to this email or contact sales@onthebus.app — we're happy to help.`,
    ``,
    `— The OnTheBus team`,
  ].join("\n");

  const html = `
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>Thanks for walking through OnTheBus with us for <strong>${escapeHtml(params.schoolName)}</strong>.</p>
    <p>Your temporary demo school has been closed.</p>
    <p>If you're ready to set up your school, or have questions about pricing and rollout,
    reply to this email or contact
    <a href="mailto:sales@onthebus.app">sales@onthebus.app</a> — we're happy to help.</p>
    <p>— The OnTheBus team</p>
  `.trim();

  return sendResendEmail({
    to: params.email,
    subject,
    text,
    html,
    from: process.env.DEMO_REQUESTS_FROM_EMAIL || undefined,
  });
}
