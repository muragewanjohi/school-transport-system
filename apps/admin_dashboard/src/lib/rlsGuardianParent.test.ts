/**
 * Runs supabase/migrations/20261026120000_guardian_aware_parent_rls.sql on a real
 * Postgres (PGlite) with a minimal Supabase shim, then exercises RLS as end users.
 * BDD: context/bdd.md — "Guardian-aware parent RLS + profile column guard".
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const MIGRATION = resolve(repoRoot, "supabase/migrations/20261026120000_guardian_aware_parent_rls.sql");

const SCHOOL_A = "aaaaaaaa-0000-4000-8000-000000000001";
const SCHOOL_B = "bbbbbbbb-0000-4000-8000-000000000002";
const ELIZAPHAN = "11111111-0000-4000-8000-000000000001"; // primary parent of Brian
const CAROLINE = "22222222-0000-4000-8000-000000000002"; // secondary guardian on Brian
const STRANGER = "33333333-0000-4000-8000-000000000003"; // parent with no children
const SCHOOL_ADMIN = "44444444-0000-4000-8000-000000000004";
const NEW_USER = "55555555-0000-4000-8000-000000000005"; // auth user without a profile
const BRIAN = "aaaa0000-0000-4000-8000-00000000000b";
const GLEN = "aaaa0000-0000-4000-8000-00000000000c";
const OTHER_SCHOOL_KID = "bbbb0000-0000-4000-8000-00000000000d";
const ROUTE_1 = "cccc0000-0000-4000-8000-000000000001";
const ROUTE_2 = "cccc0000-0000-4000-8000-000000000002";
const ROUTE_B = "cccc0000-0000-4000-8000-00000000000b";

const SHIM = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;

  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid
  $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

  -- Same definitions as 20260810180000_parent_auth_jwt_rls.sql
  CREATE FUNCTION public.jwt_role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
      nullif(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'role', ''),
      nullif(current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'role', ''),
      nullif(current_setting('request.jwt.claim.role', true), ''),
      'anon')
  $$;
  CREATE FUNCTION public.jwt_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
      nullif(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'tenant_id', ''),
      nullif(current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'tenant_id', ''),
      NULL)::uuid
  $$;

  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY, tenant_id uuid, role text NOT NULL, admin_role text, name text,
    phone text, status text, otp_code text, otp_expires_at timestamptz, avatar_url text);
  CREATE TABLE public.students (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, parent_id uuid, route_id uuid,
    name text, guardians jsonb DEFAULT '[]'::jsonb, avatar_url text);
  CREATE TABLE public.routes (id uuid PRIMARY KEY, tenant_id uuid NOT NULL);
  CREATE TABLE public.stops (id serial PRIMARY KEY, tenant_id uuid NOT NULL, route_id uuid);
  CREATE TABLE public.schedules (id serial PRIMARY KEY, tenant_id uuid NOT NULL, route_id uuid);
  CREATE TABLE public.trips (id serial PRIMARY KEY, tenant_id uuid NOT NULL, route_id uuid);
  CREATE TABLE public.live_coordinates (id serial PRIMARY KEY, tenant_id uuid NOT NULL, route_id uuid);
  CREATE TABLE public.trip_stop_etas (id serial PRIMARY KEY, tenant_id uuid NOT NULL, route_id uuid);
  CREATE TABLE public.geofences (id serial PRIMARY KEY, tenant_id uuid NOT NULL, student_id uuid);
  CREATE TABLE public.sent_proximity_alerts (id serial PRIMARY KEY, tenant_id uuid NOT NULL, student_id uuid);

  DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['profiles','students','routes','stops','schedules','trips',
      'live_coordinates','trip_stop_etas','geofences','sent_proximity_alerts'] LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated, service_role', t);
    END LOOP;
  END $$;

  -- Existing production policies these tests depend on
  CREATE POLICY "Users can access own Profile" ON public.profiles FOR ALL USING (id = auth.uid());
  CREATE POLICY "School Admins can manage profiles inside Tenant" ON public.profiles
    FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
  CREATE POLICY "Parents can update their own children" ON public.students FOR UPDATE TO authenticated
    USING (parent_id = (SELECT auth.uid())) WITH CHECK (parent_id = (SELECT auth.uid()));
`;

const SEED = `
  INSERT INTO public.profiles (id, tenant_id, role, name, phone, status) VALUES
    ('${ELIZAPHAN}', '${SCHOOL_A}', 'parent', 'Elizaphan', '+254724511201', 'Available'),
    ('${CAROLINE}',  '${SCHOOL_A}', 'parent', 'Caroline',  '+254701689463', 'Available'),
    ('${STRANGER}',  '${SCHOOL_A}', 'parent', 'Stranger',  '+254799000111', 'Available'),
    ('${SCHOOL_ADMIN}', '${SCHOOL_A}', 'school_admin', 'Admin', '+254700000001', 'Available');
  INSERT INTO public.students (id, tenant_id, parent_id, route_id, name, guardians) VALUES
    ('${BRIAN}', '${SCHOOL_A}', '${ELIZAPHAN}', '${ROUTE_1}', 'Brian',
      '[{"name":"Elizaphan","phone":"+254724511201"},{"name":"Edwin","phone":"+254731437137"},{"name":"Caroline","phone":"0701 689 463"}]'),
    ('${GLEN}', '${SCHOOL_A}', NULL, '${ROUTE_2}', 'Glen', '[{"name":"Mado","phone":"+254728581189"}]'),
    ('${OTHER_SCHOOL_KID}', '${SCHOOL_B}', NULL, '${ROUTE_B}', 'Other', '[{"name":"Caroline","phone":"+254701689463"}]');
  INSERT INTO public.routes (id, tenant_id) VALUES ('${ROUTE_1}', '${SCHOOL_A}'), ('${ROUTE_2}', '${SCHOOL_A}'), ('${ROUTE_B}', '${SCHOOL_B}');
  INSERT INTO public.stops (tenant_id, route_id) VALUES ('${SCHOOL_A}', '${ROUTE_1}'), ('${SCHOOL_A}', '${ROUTE_2}');
  INSERT INTO public.schedules (tenant_id, route_id) VALUES ('${SCHOOL_A}', '${ROUTE_1}'), ('${SCHOOL_A}', '${ROUTE_2}');
  INSERT INTO public.trips (tenant_id, route_id) VALUES ('${SCHOOL_A}', '${ROUTE_1}'), ('${SCHOOL_A}', '${ROUTE_2}');
  INSERT INTO public.live_coordinates (tenant_id, route_id) VALUES ('${SCHOOL_A}', '${ROUTE_1}'), ('${SCHOOL_A}', '${ROUTE_2}');
  INSERT INTO public.trip_stop_etas (tenant_id, route_id) VALUES ('${SCHOOL_A}', '${ROUTE_1}'), ('${SCHOOL_A}', '${ROUTE_2}');
  INSERT INTO public.geofences (tenant_id, student_id) VALUES ('${SCHOOL_A}', '${BRIAN}'), ('${SCHOOL_A}', '${GLEN}');
  INSERT INTO public.sent_proximity_alerts (tenant_id, student_id) VALUES ('${SCHOOL_A}', '${BRIAN}'), ('${SCHOOL_A}', '${GLEN}');
`;

type Claims = Record<string, unknown>;

function parentClaims(sub: string, tenantId = SCHOOL_A): Claims {
  return {
    sub,
    role: "authenticated",
    app_metadata: { role: "parent", tenant_id: tenantId },
    user_metadata: { role: "parent", tenant_id: tenantId },
  };
}

let db: PGlite;

/** Runs `sql` as `pgRole` with the given JWT claims, inside a rolled-back transaction. */
async function as<T = Record<string, unknown>>(
  claims: Claims,
  sql: string,
  pgRole = "authenticated"
): Promise<T[]> {
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

async function count(claims: Claims, table: string): Promise<number> {
  const rows = await as<{ n: number }>(claims, `SELECT count(*)::int AS n FROM public.${table}`);
  return rows[0]?.n ?? 0;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SHIM);
  await db.exec(SEED);
  await db.exec(readFileSync(MIGRATION, "utf8"));
}, 60_000);

describe("parent read access (RLS)", () => {
  it("Given Caroline is a secondary guardian on Brian, When she selects students, Then she sees only Brian", async () => {
    const rows = await as<{ id: string }>(parentClaims(CAROLINE), "SELECT id FROM public.students");
    expect(rows.map((r) => r.id)).toEqual([BRIAN]);
  });

  it.each(["routes", "stops", "schedules", "trips", "live_coordinates", "trip_stop_etas"])(
    "Given Caroline is a secondary guardian on route 1, When she selects %s, Then she sees only route 1 rows",
    async (table) => {
      const column = table === "routes" ? "id" : "route_id";
      const rows = await as<{ r: string }>(parentClaims(CAROLINE), `SELECT ${column} AS r FROM public.${table}`);
      expect(rows.map((row) => row.r)).toEqual([ROUTE_1]);
    }
  );

  it.each(["geofences", "sent_proximity_alerts"])(
    "Given Caroline is a secondary guardian on Brian, When she selects %s, Then she sees only Brian's rows",
    async (table) => {
      const rows = await as<{ s: string }>(parentClaims(CAROLINE), `SELECT student_id AS s FROM public.${table}`);
      expect(rows.map((row) => row.s)).toEqual([BRIAN]);
    }
  );

  it("Given Elizaphan is Brian's parent_id, When he selects students, Then he sees Brian", async () => {
    const rows = await as<{ id: string }>(parentClaims(ELIZAPHAN), "SELECT id FROM public.students");
    expect(rows.map((r) => r.id)).toEqual([BRIAN]);
  });

  it("Given a parent on no guardian list, When they select students and live_coordinates, Then they see nothing", async () => {
    expect(await count(parentClaims(STRANGER), "students")).toBe(0);
    expect(await count(parentClaims(STRANGER), "live_coordinates")).toBe(0);
  });

  it("Given Caroline's phone is also a guardian in School B, When she selects students as School A, Then the School B student is hidden", async () => {
    const rows = await as<{ id: string }>(parentClaims(CAROLINE), "SELECT id FROM public.students");
    expect(rows.map((r) => r.id)).not.toContain(OTHER_SCHOOL_KID);
  });

  it("Given Caroline is not Brian's parent_id, When she updates his avatar, Then no row changes", async () => {
    const rows = await as(
      parentClaims(CAROLINE),
      `UPDATE public.students SET avatar_url = 'x' WHERE id = '${BRIAN}' RETURNING id`
    );
    expect(rows).toHaveLength(0);
  });

  it("Given an anonymous request, When it selects students, Then it sees nothing", async () => {
    expect(await count({ role: "anon" }, "students")).toBe(0);
  });
});

describe("profile column guard", () => {
  it("Given a parent, When they set their own role to super_admin, Then it is rejected", async () => {
    await expect(
      as(parentClaims(STRANGER), `UPDATE public.profiles SET role = 'super_admin' WHERE id = '${STRANGER}'`)
    ).rejects.toThrow(/changed by your school/);
  });

  it("Given a parent, When they change their own phone to a guardian's number, Then it is rejected", async () => {
    await expect(
      as(parentClaims(STRANGER), `UPDATE public.profiles SET phone = '+254701689463' WHERE id = '${STRANGER}'`)
    ).rejects.toThrow(/changed by your school/);
  });

  it("Given a parent, When they update their own avatar_url, Then it succeeds", async () => {
    const rows = await as(
      parentClaims(STRANGER),
      `UPDATE public.profiles SET avatar_url = 'https://x/a.jpg' WHERE id = '${STRANGER}' RETURNING id`
    );
    expect(rows).toHaveLength(1);
  });

  it("Given an authenticated user with no profile, When they insert their own profile, Then it is rejected", async () => {
    await expect(
      as(
        { sub: NEW_USER, role: "authenticated" },
        `INSERT INTO public.profiles (id, role) VALUES ('${NEW_USER}', 'super_admin')`
      )
    ).rejects.toThrow(/created by the server/);
  });

  it("Given user_metadata.role super_admin but no app_metadata role, When they change their role, Then it is rejected", async () => {
    const forged = { sub: STRANGER, role: "authenticated", user_metadata: { role: "super_admin" } };
    await expect(
      as(forged, `UPDATE public.profiles SET role = 'super_admin' WHERE id = '${STRANGER}'`)
    ).rejects.toThrow(/changed by your school/);
  });

  it("Given a school_admin, When they set a profile's role to super_admin, Then it is rejected", async () => {
    const admin = {
      sub: SCHOOL_ADMIN,
      role: "authenticated",
      app_metadata: { role: "school_admin", tenant_id: SCHOOL_A },
    };
    await expect(
      as(admin, `UPDATE public.profiles SET role = 'super_admin' WHERE id = '${SCHOOL_ADMIN}'`)
    ).rejects.toThrow(/cannot grant platform super_admin/);
  });

  it("Given a school_admin, When they change a parent's phone in their school, Then it succeeds", async () => {
    const admin = {
      sub: SCHOOL_ADMIN,
      role: "authenticated",
      app_metadata: { role: "school_admin", tenant_id: SCHOOL_A },
    };
    const rows = await as(
      admin,
      `UPDATE public.profiles SET phone = '+254799000222' WHERE id = '${STRANGER}' RETURNING id`
    );
    expect(rows).toHaveLength(1);
  });

  it("Given the service role, When it changes role, phone and tenant_id, Then it succeeds", async () => {
    const rows = await as(
      { role: "service_role" },
      `UPDATE public.profiles SET role = 'school_admin', phone = '+254700000009', tenant_id = '${SCHOOL_B}'
       WHERE id = '${STRANGER}' RETURNING id`,
      "service_role"
    );
    expect(rows).toHaveLength(1);
  });
});
