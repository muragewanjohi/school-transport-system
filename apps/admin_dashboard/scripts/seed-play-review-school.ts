/**
 * Seed permanent Play Store review school (Driver + Parent credentials).
 *
 * Usage (from apps/admin_dashboard):
 *   npm run seed:play-review
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import { writeFile } from "fs/promises";
import path from "path";
import { provisionPlayReviewStore } from "../src/lib/playReviewProvision";

async function main() {
  const result = await provisionPlayReviewStore();
  if ("error" in result) {
    console.error("Failed:", result.error);
    process.exit(1);
  }

  const text = [
    "OnTheBus — Google Play review credentials",
    `Generated: ${new Date().toISOString()}`,
    "",
    "School: Play Review School",
    `Slug: ${result.slug}`,
    `Admin console: ${result.schoolUrl}`,
    `Admin email: ${result.adminEmail}`,
    `Admin password: ${result.adminPassword}`,
    "",
    "=== Driver app (Play Console) ===",
    `Name: Driver review account`,
    `Username (phone): ${result.driverPhone}`,
    `Password (OTP): ${result.otp}`,
    "",
    "Any other information:",
    "This app uses phone + 6-digit OTP (not a traditional password).",
    `1. Open OnTheBus Driver`,
    `2. Enter phone ${result.driverPhone}`,
    `3. Enter OTP ${result.otp}`,
    "4. Sign in, then open/start the assigned trip if prompted.",
    "Location permission is required during an active trip. NFC is optional.",
    "This review account does not expire.",
    "",
    "=== Parent app (Play Console) ===",
    `Name: Parent review account`,
    `Username (phone): ${result.parentPhone}`,
    `Password (OTP): ${result.otp}`,
    "",
    "Any other information:",
    "This app uses phone + 6-digit OTP (not a traditional password).",
    `1. Open OnTheBus Parent`,
    `2. Enter phone ${result.parentPhone}`,
    `3. Enter OTP ${result.otp}`,
    "4. Sign in to view linked children and live trip status.",
    "This review account does not expire.",
    "",
    "Notes:",
    "- Tenant is_demo=true (SMS dry-run) and demo_expires_at=null (never auto-purged).",
    "- Re-run npm run seed:play-review anytime to refresh admin password + OTP rows.",
    "- Do not commit this credentials file.",
    "",
  ].join("\n");

  const outPath = path.join(process.cwd(), ".play-review-credentials.local");
  await writeFile(outPath, text, "utf8");

  console.log(text);
  console.log(`Saved: ${outPath}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
