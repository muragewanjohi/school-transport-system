/**
 * Runs supabase/migrations/20261103120000_otp_delivery_log.sql on PGlite and checks
 * who can read and write the OTP delivery log. BDD: context/bdd.md.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const MIGRATION = resolve(repoRoot, "supabase/migrations/20261103120000_otp_delivery_log.sql");

const SCHOOL_A = "aaaaaaaa-0000-4000-8000-000000000001";
const SCHOOL_B = "bbbbbbbb-0000-4000-8000-000000000002";
const PARENT_A = "11111111-0000-4000-8000-000000000001";
const PARENT_B = "22222222-0000-4000-8000-000000000002";

const SHIM = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  -- Supabase default: new public tables are fully granted to these roles
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  CREATE FUNCTION public.jwt_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'tenant_id', '')::uuid
  $$;
  CREATE TABLE public.tenants (id uuid PRIMARY KEY);
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, tenant_id uuid);
  INSERT INTO public.tenants VALUES ('${SCHOOL_A}'), ('${SCHOOL_B}');
  INSERT INTO public.profiles VALUES ('${PARENT_A}', '${SCHOOL_A}'), ('${PARENT_B}', '${SCHOOL_B}');
`;

let db: PGlite;

async function as<T = Record<string, unknown>>(claims: Record<string, unknown>, sql: string, pgRole = "authenticated") {
  let rows: T[] = [];
  let failure: unknown = null;
  await db
    .transaction(async (tx) => {
      await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      await tx.exec(`SET LOCAL ROLE ${pgRole}`);
      try {
        rows = (await tx.query<T>(sql)).rows;
      } catch (err) {
        failure = err;
      }
      await tx.rollback();
    })
    .catch(() => undefined);
  if (failure) throw failure;
  return rows;
}

const schoolAdminA = { sub: "x", role: "authenticated", app_metadata: { role: "school_admin", tenant_id: SCHOOL_A } };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SHIM);
  await db.exec(readFileSync(MIGRATION, "utf8"));
  await db.exec(`
    INSERT INTO public.otp_delivery_log (tenant_id, profile_id, channel, provider, provider_message_id, status)
    VALUES ('${SCHOOL_A}', '${PARENT_A}', 'sms', 'africastalking', 'ATXid_A', 'sent'),
           ('${SCHOOL_B}', '${PARENT_B}', 'sms', 'africastalking', 'ATXid_B', 'sent');
  `);
}, 60_000);

describe("otp_delivery_log RLS", () => {
  it("Given a school admin of School A, When they read the log, Then only School A rows are visible", async () => {
    const rows = await as<{ provider_message_id: string }>(schoolAdminA, "SELECT provider_message_id FROM public.otp_delivery_log");
    expect(rows.map((r) => r.provider_message_id)).toEqual(["ATXid_A"]);
  });

  it("Given a parent, When they read the log, Then nothing is visible", async () => {
    const parent = { sub: PARENT_A, role: "authenticated", app_metadata: { role: "parent", tenant_id: SCHOOL_A } };
    expect(await as(parent, "SELECT id FROM public.otp_delivery_log")).toHaveLength(0);
  });

  it("Given school_admin only in user_metadata, When they read the log, Then nothing is visible", async () => {
    const forged = { sub: "x", role: "authenticated", user_metadata: { role: "school_admin", tenant_id: SCHOOL_A } };
    expect(await as(forged, "SELECT id FROM public.otp_delivery_log")).toHaveLength(0);
  });

  it("Given a platform super_admin, When they read the log, Then all schools are visible", async () => {
    const superAdmin = { sub: "x", role: "authenticated", app_metadata: { role: "super_admin" } };
    expect(await as(superAdmin, "SELECT id FROM public.otp_delivery_log")).toHaveLength(2);
  });

  it("Given a school admin, When they try to insert a row, Then it is refused", async () => {
    await expect(
      as(
        schoolAdminA,
        `INSERT INTO public.otp_delivery_log (tenant_id, channel, provider, status) VALUES ('${SCHOOL_A}', 'sms', 'africastalking', 'sent')`
      )
    ).rejects.toThrow(/permission denied|row-level security/);
  });

  it("Given a super_admin, When they try to update a row, Then the revoked grant refuses it", async () => {
    const superAdmin = { sub: "x", role: "authenticated", app_metadata: { role: "super_admin" } };
    await expect(as(superAdmin, "UPDATE public.otp_delivery_log SET status = 'delivered'")).rejects.toThrow(
      /permission denied/
    );
  });

  it("Given the same provider message id twice, When inserted by the service role, Then the duplicate is refused", async () => {
    await expect(
      as(
        { role: "service_role" },
        `INSERT INTO public.otp_delivery_log (tenant_id, channel, provider, provider_message_id, status) VALUES ('${SCHOOL_A}', 'sms', 'africastalking', 'ATXid_A', 'sent')`,
        "service_role"
      )
    ).rejects.toThrow(/duplicate key/);
  });

  it("Given an unknown status, When inserted, Then the check constraint refuses it", async () => {
    await expect(
      as(
        { role: "service_role" },
        `INSERT INTO public.otp_delivery_log (tenant_id, channel, provider, status) VALUES ('${SCHOOL_A}', 'sms', 'africastalking', 'maybe')`,
        "service_role"
      )
    ).rejects.toThrow(/check constraint/);
  });
});
