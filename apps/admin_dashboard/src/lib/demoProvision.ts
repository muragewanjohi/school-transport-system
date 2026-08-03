import { createHash, randomBytes, randomUUID } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { getApexPublicUrl, getTenantPublicUrl, ROOT_DOMAIN } from "@/lib/tenantHost";
import { removeTenantSubdomain } from "@/lib/vercelDomains";

export const DEMO_DEFAULT_EXPIRY_DAYS = 14;

const NAIROBI_CBD = { lat: -1.2921, lng: 36.8219 };

type LatLng = { lat: number; lng: number };

export type DemoProvisionInput = {
  demoRequestId: string;
  schoolName: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  /** ISO expiry; defaults to now + 14 days when omitted */
  expiresAt?: string;
};

export type DemoProvisionResult = {
  tenantId: string;
  slug: string;
  schoolUrl: string;
  adminEmail: string;
  adminPassword: string;
  phone: string;
  otp: string;
  expiresAt: string;
};

export type DemoProvisionError = { error: string };

function pointWkt(lng: number, lat: number): string {
  return `POINT(${lng} ${lat})`;
}

function lineWkt(points: LatLng[]): string {
  const coords = points.map((p) => `${p.lng} ${p.lat}`).join(", ");
  return `SRID=4326;LINESTRING(${coords})`;
}

export function normalizeDemoPhone(phone: string): string {
  let clean = phone.trim().replace(/[\s\-()]/g, "");
  if (clean.startsWith("0")) {
    clean = `+254${clean.slice(1)}`;
  } else if (!clean.startsWith("+")) {
    clean = `+${clean}`;
  }
  return clean;
}

export function slugifySchoolName(schoolName: string): string {
  const base =
    schoolName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || "school";
  return base;
}

export function buildDemoSlug(schoolName: string, attempt = 0): string {
  const base = slugifySchoolName(schoolName);
  const suffix = attempt <= 0 ? "" : `-${attempt}`;
  const candidate = `${base}${suffix}-demo`;
  return candidate.slice(0, 48);
}

function offsetPoint(base: LatLng, delta: LatLng): LatLng {
  return { lat: base.lat + delta.lat, lng: base.lng + delta.lng };
}

function generatePassword(): string {
  return randomBytes(12).toString("base64url");
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function syntheticPhone(seed: string, index: number): string {
  const hash = createHash("sha256").update(`${seed}:${index}`).digest("hex");
  const digits = (parseInt(hash.slice(0, 7), 16) % 10_000_000).toString().padStart(7, "0");
  return `+25471${digits}`;
}

async function geocodeDemoAnchor(city: string, country: string): Promise<LatLng> {
  const apiKey =
    process.env.GOOGLE_MAPS_SERVER_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { ...NAIROBI_CBD };

  const query = encodeURIComponent(`${city}, ${country}`);
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${apiKey}`
    );
    if (!res.ok) return { ...NAIROBI_CBD };
    const json = (await res.json()) as {
      results?: { geometry?: { location?: { lat: number; lng: number } } }[];
    };
    const loc = json.results?.[0]?.geometry?.location;
    if (
      loc &&
      typeof loc.lat === "number" &&
      typeof loc.lng === "number" &&
      Number.isFinite(loc.lat) &&
      Number.isFinite(loc.lng)
    ) {
      return { lat: loc.lat, lng: loc.lng };
    }
  } catch {
    /* fallback below */
  }
  return { ...NAIROBI_CBD };
}

function avatarPublicUrl(filename: string): string {
  return getApexPublicUrl(`/demo-seed-avatars/${filename}`);
}

async function uploadAvatarIfPossible(
  adminClient: SupabaseClient,
  tenantId: string,
  filename: string
): Promise<string> {
  const publicFallback = avatarPublicUrl(filename);
  try {
    const filePath = path.join(process.cwd(), "public", "demo-seed-avatars", filename);
    const bytes = await readFile(filePath);
    const storagePath = `demo-stores/${tenantId}/${filename}`;
    const { error } = await adminClient.storage.from("avatars").upload(storagePath, bytes, {
      contentType: "image/svg+xml",
      upsert: true,
    });
    if (error) return publicFallback;
    const { data } = adminClient.storage.from("avatars").getPublicUrl(storagePath);
    return data.publicUrl || publicFallback;
  } catch {
    return publicFallback;
  }
}

async function allocateUniqueSlug(
  adminClient: SupabaseClient,
  schoolName: string
): Promise<string | { error: string }> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = buildDemoSlug(schoolName, attempt);
    const { data } = await adminClient
      .from("tenants")
      .select("id")
      .eq("domain", slug)
      .maybeSingle();
    if (!data) return slug;
  }
  return { error: "Could not allocate a unique demo subdomain" };
}

async function phoneConflictsWithLiveSchool(
  adminClient: SupabaseClient,
  phone: string
): Promise<boolean> {
  const { data: profiles } = await adminClient
    .from("profiles")
    .select("id, tenant_id, role, phone")
    .in("role", ["parent", "driver"])
    .in("phone", [phone, phone.replace(/^\+/, ""), phone.startsWith("+254") ? `0${phone.slice(4)}` : phone]);

  if (!profiles?.length) return false;

  const tenantIds = [...new Set(profiles.map((p) => p.tenant_id).filter(Boolean))] as string[];
  if (tenantIds.length === 0) return false;

  const { data: tenants } = await adminClient
    .from("tenants")
    .select("id, is_demo, deleted_at, status")
    .in("id", tenantIds);

  return (tenants ?? []).some((t) => !t.deleted_at && t.status === "active");
}

/**
 * Hard-delete an is_demo tenant: Auth admin users, Vercel subdomain, then cascade delete.
 */
export async function purgeDemoTenant(
  adminClient: SupabaseClient,
  tenantId: string
): Promise<{ ok: boolean; detail?: string }> {
  const { data: tenant } = await adminClient
    .from("tenants")
    .select("id, domain, is_demo")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenant) return { ok: true, detail: "already gone" };
  if (!tenant.is_demo) return { ok: false, detail: "refusing to purge non-demo tenant" };

  const { data: profiles } = await adminClient
    .from("profiles")
    .select("id, role")
    .eq("tenant_id", tenantId)
    .eq("role", "school_admin");

  for (const profile of profiles ?? []) {
    try {
      await adminClient.auth.admin.deleteUser(profile.id);
    } catch (err) {
      console.warn("[demo-provision] auth delete failed:", err);
    }
  }

  if (tenant.domain && !String(tenant.domain).startsWith("deleted-")) {
    await removeTenantSubdomain(tenant.domain);
  }

  await adminClient
    .from("demo_requests")
    .update({ provisioned_tenant_id: null })
    .eq("provisioned_tenant_id", tenantId);

  const { error } = await adminClient.from("tenants").delete().eq("id", tenantId);
  if (error) return { ok: false, detail: error.message };
  return { ok: true };
}

export async function provisionDemoStore(
  input: DemoProvisionInput
): Promise<DemoProvisionResult | DemoProvisionError> {
  const adminClient = getServiceSupabaseClient();
  if (!adminClient) return { error: "Service unavailable" };

  const phone = normalizeDemoPhone(input.phone);
  if (await phoneConflictsWithLiveSchool(adminClient, phone)) {
    return {
      error:
        "This phone number is already in use by an active parent or driver account. Complete or wait for that demo to expire, or use a different number.",
    };
  }

  const slugResult = await allocateUniqueSlug(adminClient, input.schoolName);
  if (typeof slugResult !== "string") return slugResult;
  const slug = slugResult;

  const expiresAt =
    input.expiresAt ||
    new Date(Date.now() + DEMO_DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const anchor = await geocodeDemoAnchor(input.city, input.country);
  const delta: LatLng = {
    lat: anchor.lat - NAIROBI_CBD.lat,
    lng: anchor.lng - NAIROBI_CBD.lng,
  };

  const campusPt = offsetPoint(NAIROBI_CBD, delta);
  const stopS1 = offsetPoint({ lat: -1.267, lng: 36.8095 }, delta);
  const stopS2 = offsetPoint({ lat: -1.275, lng: 36.812 }, delta);
  const stopS3 = offsetPoint({ lat: -1.282, lng: 36.816 }, delta);
  const stopS4 = offsetPoint({ lat: -1.288, lng: 36.819 }, delta);
  const pathPts = [stopS1, stopS2, stopS3, stopS4, campusPt];

  const adminPassword = generatePassword();
  const otp = generateOtp();
  const adminEmail = `admin.${slug.replace(/-demo$/, "")}@demo.onthebus.app`.slice(0, 120);

  const tenantId = randomUUID();
  const campusId = randomUUID();
  const driverId = randomUUID();
  const conductorId = randomUUID();
  const guardian1Id = randomUUID();
  const guardian2Id = randomUUID();
  const guardian3Id = randomUUID();
  const vehicleId = randomUUID();
  const routeId = randomUUID();
  const stopIds = {
    s1: randomUUID(),
    s2: randomUUID(),
    s3: randomUUID(),
    s4: randomUUID(),
    gate: randomUUID(),
  };
  const schedAmId = randomUUID();
  const schedPmId = randomUUID();
  const studentIds = {
    brother: randomUUID(),
    sister: randomUUID(),
    s3: randomUUID(),
    s4: randomUUID(),
    s5: randomUUID(),
  };
  const tripId = randomUUID();

  const [
    driverAvatar,
    conductorAvatar,
    g1Avatar,
    g2Avatar,
    g3Avatar,
    brotherAvatar,
    sisterAvatar,
    s3Avatar,
    s4Avatar,
    s5Avatar,
  ] = await Promise.all([
    uploadAvatarIfPossible(adminClient, tenantId, "driver.svg"),
    uploadAvatarIfPossible(adminClient, tenantId, "conductor.svg"),
    uploadAvatarIfPossible(adminClient, tenantId, "guardian-1.svg"),
    uploadAvatarIfPossible(adminClient, tenantId, "guardian-2.svg"),
    uploadAvatarIfPossible(adminClient, tenantId, "guardian-3.svg"),
    uploadAvatarIfPossible(adminClient, tenantId, "student-brother.svg"),
    uploadAvatarIfPossible(adminClient, tenantId, "student-sister.svg"),
    uploadAvatarIfPossible(adminClient, tenantId, "student-3.svg"),
    uploadAvatarIfPossible(adminClient, tenantId, "student-4.svg"),
    uploadAvatarIfPossible(adminClient, tenantId, "student-5.svg"),
  ]);

  const { error: tenantError } = await adminClient.from("tenants").insert({
    id: tenantId,
    name: input.schoolName,
    domain: slug,
    status: "active",
    contact_email: input.email,
    contact_phone: phone,
    is_demo: true,
    demo_expires_at: expiresAt,
    demo_request_id: input.demoRequestId,
  });

  if (tenantError) {
    return { error: tenantError.message || "Failed to create demo tenant" };
  }

  const rollback = async () => {
    await purgeDemoTenant(adminClient, tenantId);
  };

  try {
    const { error: campusError } = await adminClient.from("campuses").insert({
      id: campusId,
      tenant_id: tenantId,
      name: `${input.schoolName} Campus`,
      latitude: campusPt.lat,
      longitude: campusPt.lng,
      location: pointWkt(campusPt.lng, campusPt.lat),
      status: "active",
    });
    if (campusError) throw new Error(campusError.message);

    await adminClient.from("billing_status").upsert(
      {
        tenant_id: tenantId,
        plan_name: "Demo",
        price_desc: "Demo store — not billed",
        is_paid: true,
        campus_monthly_fee_kes: 0,
        students_count: 5,
        active_routes_count: 1,
        drivers_count: 1,
        sms_used_this_month: 0,
      },
      { onConflict: "tenant_id" }
    );

    await adminClient.from("tenant_configs").upsert(
      {
        tenant_id: tenantId,
        school_name: input.schoolName,
        school_phone: phone,
        school_email: input.email,
        school_address: `${input.city}, ${input.country}`,
      },
      { onConflict: "tenant_id" }
    );

    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        role: "school_admin",
        admin_role: "Super Admin",
        tenant_id: tenantId,
        name: `${input.fullName} (Demo Admin)`,
      },
    });

    if (authError || !authUser.user) {
      throw new Error(authError?.message || "Failed to create demo admin user");
    }

    const adminProfileId = authUser.user.id;
    const { error: adminProfileError } = await adminClient.from("profiles").upsert({
      id: adminProfileId,
      tenant_id: tenantId,
      role: "school_admin",
      admin_role: "Super Admin",
      name: `${input.fullName} (Demo Admin)`,
      email: adminEmail,
      phone,
      status: "Available",
    });
    if (adminProfileError) throw new Error(adminProfileError.message);

    const conductorPhone = syntheticPhone(input.demoRequestId, 1);
    const guardian2Phone = syntheticPhone(input.demoRequestId, 2);
    const guardian3Phone = syntheticPhone(input.demoRequestId, 3);

    const { error: staffError } = await adminClient.from("profiles").insert([
      {
        id: driverId,
        tenant_id: tenantId,
        role: "driver",
        name: `Demo Driver — ${input.schoolName}`,
        email: `driver.${slug}@demo.onthebus.app`,
        phone,
        status: "Available",
        otp_code: otp,
        otp_expires_at: expiresAt,
        avatar_url: driverAvatar,
      },
      {
        id: conductorId,
        tenant_id: tenantId,
        role: "conductor",
        name: `Demo Conductor — ${input.schoolName}`,
        email: `conductor.${slug}@demo.onthebus.app`,
        phone: conductorPhone,
        status: "Available",
        avatar_url: conductorAvatar,
      },
      {
        id: guardian1Id,
        tenant_id: tenantId,
        role: "parent",
        name: input.fullName,
        email: input.email,
        phone,
        status: "Available",
        otp_code: otp,
        otp_expires_at: expiresAt,
        avatar_url: g1Avatar,
      },
      {
        id: guardian2Id,
        tenant_id: tenantId,
        role: "parent",
        name: "Guardian Njeri",
        email: `guardian2.${slug}@demo.onthebus.app`,
        phone: guardian2Phone,
        status: "Available",
        avatar_url: g2Avatar,
      },
      {
        id: guardian3Id,
        tenant_id: tenantId,
        role: "parent",
        name: "Guardian Kamau",
        email: `guardian3.${slug}@demo.onthebus.app`,
        phone: guardian3Phone,
        status: "Available",
        avatar_url: g3Avatar,
      },
    ]);
    if (staffError) throw new Error(staffError.message);

    const { error: vehicleError } = await adminClient.from("vehicles").insert({
      id: vehicleId,
      tenant_id: tenantId,
      campus_id: campusId,
      license_plate: "KDA DEMO",
      model: "Toyota Coaster",
      capacity: 30,
      status: "Active",
      active_driver_id: driverId,
      conductor_1_id: conductorId,
    });
    if (vehicleError) throw new Error(vehicleError.message);

    const { error: routeError } = await adminClient.from("routes").insert({
      id: routeId,
      tenant_id: tenantId,
      campus_id: campusId,
      name: "Morning / Afternoon Corridor",
      path: lineWkt(pathPts),
    });
    if (routeError) throw new Error(routeError.message);

    const { error: stopsError } = await adminClient.from("stops").insert([
      {
        id: stopIds.s1,
        tenant_id: tenantId,
        campus_id: campusId,
        route_id: routeId,
        name: "Stop Riverside",
        location: pointWkt(stopS1.lng, stopS1.lat),
        sequence_no: 1,
        stop_type: "PICKUP",
      },
      {
        id: stopIds.s2,
        tenant_id: tenantId,
        campus_id: campusId,
        route_id: routeId,
        name: "Stop Market",
        location: pointWkt(stopS2.lng, stopS2.lat),
        sequence_no: 2,
        stop_type: "PICKUP",
      },
      {
        id: stopIds.s3,
        tenant_id: tenantId,
        campus_id: campusId,
        route_id: routeId,
        name: "Stop Park",
        location: pointWkt(stopS3.lng, stopS3.lat),
        sequence_no: 3,
        stop_type: "PICKUP",
      },
      {
        id: stopIds.s4,
        tenant_id: tenantId,
        campus_id: campusId,
        route_id: routeId,
        name: "Stop Estate",
        location: pointWkt(stopS4.lng, stopS4.lat),
        sequence_no: 4,
        stop_type: "PICKUP",
      },
      {
        id: stopIds.gate,
        tenant_id: tenantId,
        campus_id: campusId,
        route_id: routeId,
        name: `${input.schoolName} Gate`,
        location: pointWkt(campusPt.lng, campusPt.lat),
        sequence_no: 5,
        stop_type: "DROPOFF",
      },
    ]);
    if (stopsError) throw new Error(stopsError.message);

    const { error: schedError } = await adminClient.from("schedules").insert([
      {
        id: schedAmId,
        tenant_id: tenantId,
        campus_id: campusId,
        route_id: routeId,
        vehicle_id: vehicleId,
        name: "Corridor AM",
        departure_time: "06:45",
        direction: "HOME_TO_SCHOOL",
        target_grades: ["Grade 1", "Grade 2", "Grade 3", "Grade 4"],
        days_of_week: [1, 2, 3, 4, 5],
      },
      {
        id: schedPmId,
        tenant_id: tenantId,
        campus_id: campusId,
        route_id: routeId,
        vehicle_id: vehicleId,
        name: "Corridor PM",
        departure_time: "15:30",
        direction: "SCHOOL_TO_HOME",
        target_grades: ["Grade 1", "Grade 2", "Grade 3", "Grade 4"],
        days_of_week: [1, 2, 3, 4, 5],
      },
    ]);
    if (schedError) throw new Error(schedError.message);

    const home = (pt: LatLng, i: number) =>
      offsetPoint({ lat: pt.lat + i * 0.0003, lng: pt.lng + i * 0.0002 }, { lat: 0, lng: 0 });

    const { error: studentsError } = await adminClient.from("students").insert([
      {
        id: studentIds.brother,
        tenant_id: tenantId,
        campus_id: campusId,
        name: "Brian Demo",
        parent_id: guardian1Id,
        route_id: routeId,
        pickup_stop_id: stopIds.s1,
        dropoff_stop_id: stopIds.gate,
        schedule_ids: [schedAmId],
        nfc_card_hash: `DEMO-${slug}-BR`,
        grade: "Grade 4",
        class_name: "4 Blue",
        status: "Present",
        avatar_url: brotherAvatar,
        guardians: [{ name: input.fullName, phone }],
        pickup_location: pointWkt(home(stopS1, 1).lng, home(stopS1, 1).lat),
        address: `Near Stop Riverside, ${input.city}`,
      },
      {
        id: studentIds.sister,
        tenant_id: tenantId,
        campus_id: campusId,
        name: "Grace Demo",
        parent_id: guardian1Id,
        route_id: routeId,
        pickup_stop_id: stopIds.s1,
        dropoff_stop_id: stopIds.gate,
        schedule_ids: [schedPmId],
        nfc_card_hash: `DEMO-${slug}-SI`,
        grade: "Grade 2",
        class_name: "2 Green",
        status: "Present",
        avatar_url: sisterAvatar,
        guardians: [{ name: input.fullName, phone }],
        pickup_location: pointWkt(home(stopS1, 2).lng, home(stopS1, 2).lat),
        address: `Near Stop Riverside, ${input.city}`,
      },
      {
        id: studentIds.s3,
        tenant_id: tenantId,
        campus_id: campusId,
        name: "Amina Demo",
        parent_id: guardian2Id,
        route_id: routeId,
        pickup_stop_id: stopIds.s2,
        dropoff_stop_id: stopIds.gate,
        schedule_ids: [schedAmId],
        nfc_card_hash: `DEMO-${slug}-S3`,
        grade: "Grade 3",
        class_name: "3 Blue",
        status: "Present",
        avatar_url: s3Avatar,
        guardians: [{ name: "Guardian Njeri", phone: guardian2Phone }],
        pickup_location: pointWkt(home(stopS2, 1).lng, home(stopS2, 1).lat),
        address: `Near Stop Market, ${input.city}`,
      },
      {
        id: studentIds.s4,
        tenant_id: tenantId,
        campus_id: campusId,
        name: "David Demo",
        parent_id: guardian2Id,
        route_id: routeId,
        pickup_stop_id: stopIds.s3,
        dropoff_stop_id: stopIds.gate,
        schedule_ids: [schedAmId],
        nfc_card_hash: `DEMO-${slug}-S4`,
        grade: "Grade 5",
        class_name: "5 Green",
        status: "Present",
        avatar_url: s4Avatar,
        guardians: [{ name: "Guardian Njeri", phone: guardian2Phone }],
        pickup_location: pointWkt(home(stopS3, 1).lng, home(stopS3, 1).lat),
        address: `Near Stop Park, ${input.city}`,
      },
      {
        id: studentIds.s5,
        tenant_id: tenantId,
        campus_id: campusId,
        name: "Elena Demo",
        parent_id: guardian3Id,
        route_id: routeId,
        pickup_stop_id: stopIds.s4,
        dropoff_stop_id: stopIds.gate,
        schedule_ids: [schedPmId],
        nfc_card_hash: `DEMO-${slug}-S5`,
        grade: "Grade 1",
        class_name: "1 Blue",
        status: "Present",
        avatar_url: s5Avatar,
        guardians: [{ name: "Guardian Kamau", phone: guardian3Phone }],
        pickup_location: pointWkt(home(stopS4, 1).lng, home(stopS4, 1).lat),
        address: `Near Stop Estate, ${input.city}`,
      },
    ]);
    if (studentsError) throw new Error(studentsError.message);

    const { error: tripError } = await adminClient.from("trips").insert({
      id: tripId,
      tenant_id: tenantId,
      campus_id: campusId,
      schedule_id: schedAmId,
      route_id: routeId,
      vehicle_id: vehicleId,
      driver_id: driverId,
      trip_date: new Date().toISOString().slice(0, 10),
      status: "in_progress",
      started_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    });
    if (tripError) throw new Error(tripError.message);

    // Live trail (best-effort; triggers may block — ignore failures)
    try {
      await adminClient.from("live_coordinates").insert(
        pathPts.slice(0, 4).map((pt, i) => ({
          tenant_id: tenantId,
          vehicle_id: vehicleId,
          route_id: routeId,
          coordinates: pointWkt(pt.lng, pt.lat),
          speed: 25 + i * 2,
          bearing: 160,
          created_at: new Date(Date.now() - (8 - i * 2) * 60 * 1000).toISOString(),
        }))
      );
    } catch {
      /* non-fatal for demo maps */
    }

    await adminClient
      .from("demo_requests")
      .update({ provisioned_tenant_id: tenantId })
      .eq("id", input.demoRequestId);

    const schoolUrl =
      process.env.NODE_ENV !== "production" &&
      process.env.NEXT_PUBLIC_SITE_URL?.includes("localhost")
        ? getTenantPublicUrl(slug, "/login")
        : `https://${slug}.${ROOT_DOMAIN}/login`;

    return {
      tenantId,
      slug,
      schoolUrl,
      adminEmail,
      adminPassword,
      phone,
      otp,
      expiresAt,
    };
  } catch (err) {
    await rollback();
    const message = err instanceof Error ? err.message : "Demo provision failed";
    return { error: message };
  }
}

export async function extendDemoOtpExpiry(
  adminClient: SupabaseClient,
  tenantId: string,
  expiresAt: string
): Promise<void> {
  await adminClient
    .from("profiles")
    .update({ otp_expires_at: expiresAt })
    .eq("tenant_id", tenantId)
    .not("otp_code", "is", null);
}
