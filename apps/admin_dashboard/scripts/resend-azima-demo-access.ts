/**
 * Reset Azima demo admin password and email access details to the requester.
 * If Resend cannot deliver (unverified domain / sandbox), writes credentials to
 * `.azima-demo-credentials.local` for manual forwarding.
 *
 * Usage: npx tsx --env-file=.env.local scripts/resend-azima-demo-access.ts
 */
import { writeFile } from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { resetDemoAccessCredentials } from "../src/lib/demoProvision";
import { notifyDemoReady } from "../src/lib/demoRequestEmails";

const AZIMA_REQUEST_ID = "c7ba705a-d6ae-477c-a802-c06951ef2136";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send the access email");
  }

  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: request, error } = await adminClient
    .from("demo_requests")
    .select("id, full_name, email, school_name, status, provisioned_tenant_id")
    .eq("id", AZIMA_REQUEST_ID)
    .single();

  if (error || !request) {
    throw new Error(error?.message || "Azima demo request not found");
  }
  if (request.status !== "confirmed" || !request.provisioned_tenant_id) {
    throw new Error(`Azima request is not confirmed/provisioned (status=${request.status})`);
  }
  if (!request.email) {
    throw new Error("Azima request is missing requester email");
  }

  const reset = await resetDemoAccessCredentials(adminClient, request.provisioned_tenant_id);
  if ("error" in reset) {
    throw new Error(reset.error);
  }

  const forEmail = {
    ...reset,
    schoolUrl: `https://${reset.slug}.onthebusapp.com/login`,
  };

  const sent = await notifyDemoReady({
    ...forEmail,
    fullName: request.full_name,
    email: request.email,
    schoolName: request.school_name,
  });

  const outPath = path.join(process.cwd(), ".azima-demo-credentials.local");
  const lines = [
    `Requester: ${request.email}`,
    `School: ${request.school_name}`,
    `School URL: ${forEmail.schoolUrl}`,
    `Admin email: ${forEmail.adminEmail}`,
    `Admin password: ${forEmail.adminPassword}`,
    `Flutter phone: ${forEmail.phone}`,
    `Flutter OTP: ${forEmail.otp}`,
    `Expires: ${forEmail.expiresAt}`,
    `Email sent via Resend: ${sent}`,
    `Generated at: ${new Date().toISOString()}`,
  ].join("\n");
  await writeFile(outPath, lines + "\n", "utf8");

  if (!sent) {
    console.error(
      "Resend could not deliver to the requester (verify a domain at resend.com/domains and set DEMO_REQUESTS_FROM_EMAIL to that domain)."
    );
    console.error(`Credentials written to ${outPath} for manual forward to ${request.email}.`);
    process.exit(2);
  }

  console.log(`Azima access email sent to ${request.email}.`);
  console.log(`School URL: ${forEmail.schoolUrl}`);
  console.log(`Credentials also saved to ${outPath}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
