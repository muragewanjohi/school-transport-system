import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { getTenantPublicUrl } from "@/lib/tenantHost";

/** Permanent Play Store review sandbox — never set demo_expires_at. */
export const PLAY_REVIEW_SLUG = "play-review";
export const PLAY_REVIEW_SCHOOL_NAME = "Play Review School";

export const PLAY_REVIEW_DRIVER_PHONE = "+254700000001";
export const PLAY_REVIEW_PARENT_PHONE = "+254700000002";
export const PLAY_REVIEW_OTP = "123456";

export const PLAY_REVIEW_ADMIN_EMAIL = "play-review-admin@onthebus.app";

const IDS = {
  tenant: "b0000000-0000-4000-8000-000000000001",
  campus: "b0000000-0000-4000-8000-000000000002",
  driver: "b0000000-0000-4000-8000-000000000031",
  conductor: "b0000000-0000-4000-8000-000000000032",
  parent: "b0000000-0000-4000-8000-000000000041",
  parent2: "b0000000-0000-4000-8000-000000000042",
  vehicle: "b0000000-0000-4000-8000-000000000021",
  route: "b0000000-0000-4000-8000-000000000011",
  stop1: "b0000000-0000-4000-8000-000000000051",
  stop2: "b0000000-0000-4000-8000-000000000052",
  stop3: "b0000000-0000-4000-8000-000000000053",
  stopGate: "b0000000-0000-4000-8000-000000000054",
  schedAm: "b0000000-0000-4000-8000-000000000061",
  schedPm: "b0000000-0000-4000-8000-000000000062",
  schedMidMorning: "b0000000-0000-4000-8000-000000000063",
  schedMidday: "b0000000-0000-4000-8000-000000000064",
  schedMidAfternoon: "b0000000-0000-4000-8000-000000000065",
  student1: "b0000000-0000-4000-8000-000000000081",
  student2: "b0000000-0000-4000-8000-000000000082",
  student3: "b0000000-0000-4000-8000-000000000083",
  student4: "b0000000-0000-4000-8000-000000000084",
  student5: "b0000000-0000-4000-8000-000000000085",
  trip: "b0000000-0000-4000-8000-000000000071",
} as const;

const CAMPUS = { lat: -1.2921, lng: 36.8219 };
const STOP1 = { lat: -1.267, lng: 36.8095 };
const STOP2 = { lat: -1.275, lng: 36.812 };
const STOP3 = { lat: -1.282, lng: 36.816 };

function pointWkt(lng: number, lat: number): string {
  return `POINT(${lng} ${lat})`;
}

function lineWkt(
  points: ReadonlyArray<{ lat: number; lng: number }>
): string {
  const coords = points.map((p) => `${p.lng} ${p.lat}`).join(", ");
  return `SRID=4326;LINESTRING(${coords})`;
}

export type PlayReviewProvisionResult = {
  tenantId: string;
  slug: string;
  schoolUrl: string;
  adminEmail: string;
  adminPassword: string;
  driverPhone: string;
  parentPhone: string;
  otp: string;
  neverExpires: true;
};

export type PlayReviewProvisionError = { error: string };

async function ensureAdminUser(
  client: SupabaseClient,
  tenantId: string,
  password: string
): Promise<string> {
  const { data: created, error: createError } = await client.auth.admin.createUser({
    email: PLAY_REVIEW_ADMIN_EMAIL,
    password,
    email_confirm: true,
    user_metadata: {
      role: "school_admin",
      admin_role: "Super Admin",
      tenant_id: tenantId,
      name: "Play Review Admin",
    },
  });

  if (!createError && created.user) {
    return created.user.id;
  }

  const msg = createError?.message?.toLowerCase() ?? "";
  if (!msg.includes("already") && !msg.includes("registered") && !msg.includes("exists")) {
    throw new Error(createError?.message || "Failed to create play-review admin");
  }

  const { data: list, error: listError } = await client.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listError) throw new Error(listError.message);

  const existing = list.users.find(
    (u) => u.email?.toLowerCase() === PLAY_REVIEW_ADMIN_EMAIL.toLowerCase()
  );
  if (!existing) {
    throw new Error("Play-review admin exists but could not be located");
  }

  const { error: updateError } = await client.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    user_metadata: {
      ...existing.user_metadata,
      role: "school_admin",
      admin_role: "Super Admin",
      tenant_id: tenantId,
      name: "Play Review Admin",
    },
  });
  if (updateError) throw new Error(updateError.message);
  return existing.id;
}

/**
 * Idempotent seed for Google Play review accounts (Driver + Parent).
 * - is_demo=true → SMS kill-switch + reusable OTP
 * - demo_expires_at=null → never purged by demo expiry cron
 */
export async function provisionPlayReviewStore(): Promise<
  PlayReviewProvisionResult | PlayReviewProvisionError
> {
  const client = getServiceSupabaseClient();
  if (!client) {
    return {
      error:
        "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (load apps/admin_dashboard/.env.local).",
    };
  }

  const adminPassword = `PlayRev-${randomBytes(9).toString("base64url")}`;
  const farFuture = new Date("2099-12-31T23:59:59.000Z").toISOString();
  const pathPts = [STOP1, STOP2, STOP3, CAMPUS];

  try {
    const { error: tenantError } = await client.from("tenants").upsert(
      {
        id: IDS.tenant,
        name: PLAY_REVIEW_SCHOOL_NAME,
        domain: PLAY_REVIEW_SLUG,
        status: "active",
        contact_email: PLAY_REVIEW_ADMIN_EMAIL,
        contact_phone: PLAY_REVIEW_DRIVER_PHONE,
        is_demo: true,
        demo_expires_at: null,
        deleted_at: null,
      },
      { onConflict: "id" }
    );
    if (tenantError) throw new Error(tenantError.message);

    // Keep domain pinned even if a stale row reused the id
    await client
      .from("tenants")
      .update({
        domain: PLAY_REVIEW_SLUG,
        is_demo: true,
        demo_expires_at: null,
        deleted_at: null,
        status: "active",
        name: PLAY_REVIEW_SCHOOL_NAME,
      })
      .eq("id", IDS.tenant);

    const { error: campusError } = await client.from("campuses").upsert(
      {
        id: IDS.campus,
        tenant_id: IDS.tenant,
        name: "Play Review Campus",
        latitude: CAMPUS.lat,
        longitude: CAMPUS.lng,
        location: pointWkt(CAMPUS.lng, CAMPUS.lat),
        status: "active",
        deleted_at: null,
      },
      { onConflict: "id" }
    );
    if (campusError) throw new Error(campusError.message);

    await client.from("billing_status").upsert(
      {
        tenant_id: IDS.tenant,
        plan_name: "Play Review",
        price_desc: "Play Store review sandbox — not billed",
        is_paid: true,
        campus_monthly_fee_kes: 0,
        students_count: 5,
        active_routes_count: 1,
        drivers_count: 1,
        sms_used_this_month: 0,
      },
      { onConflict: "tenant_id" }
    );

    await client.from("tenant_configs").upsert(
      {
        tenant_id: IDS.tenant,
        school_name: PLAY_REVIEW_SCHOOL_NAME,
        school_phone: PLAY_REVIEW_DRIVER_PHONE,
        school_email: PLAY_REVIEW_ADMIN_EMAIL,
        school_address: "Nairobi, Kenya",
      },
      { onConflict: "tenant_id" }
    );

    const adminProfileId = await ensureAdminUser(client, IDS.tenant, adminPassword);

    const { error: adminProfileError } = await client.from("profiles").upsert({
      id: adminProfileId,
      tenant_id: IDS.tenant,
      role: "school_admin",
      admin_role: "Super Admin",
      name: "Play Review Admin",
      email: PLAY_REVIEW_ADMIN_EMAIL,
      phone: PLAY_REVIEW_DRIVER_PHONE,
      status: "Available",
    });
    if (adminProfileError) throw new Error(adminProfileError.message);

    const { error: staffError } = await client.from("profiles").upsert(
      [
        {
          id: IDS.driver,
          tenant_id: IDS.tenant,
          role: "driver",
          name: "Play Review Driver",
          email: "driver.play-review@onthebus.app",
          phone: PLAY_REVIEW_DRIVER_PHONE,
          status: "Available",
          otp_code: PLAY_REVIEW_OTP,
          otp_expires_at: farFuture,
        },
        {
          id: IDS.conductor,
          tenant_id: IDS.tenant,
          role: "conductor",
          name: "Play Review Conductor",
          email: "conductor.play-review@onthebus.app",
          phone: "+254700000003",
          status: "Available",
          otp_code: PLAY_REVIEW_OTP,
          otp_expires_at: farFuture,
        },
        {
          id: IDS.parent,
          tenant_id: IDS.tenant,
          role: "parent",
          name: "Play Review Parent",
          email: "parent.play-review@onthebus.app",
          phone: PLAY_REVIEW_PARENT_PHONE,
          status: "Available",
          otp_code: PLAY_REVIEW_OTP,
          otp_expires_at: farFuture,
        },
        {
          id: IDS.parent2,
          tenant_id: IDS.tenant,
          role: "parent",
          name: "Play Review Parent Two",
          email: "parent2.play-review@onthebus.app",
          phone: "+254700000004",
          status: "Available",
          otp_code: PLAY_REVIEW_OTP,
          otp_expires_at: farFuture,
        },
      ],
      { onConflict: "id" }
    );
    if (staffError) throw new Error(staffError.message);

    const { error: vehicleError } = await client.from("vehicles").upsert(
      {
        id: IDS.vehicle,
        tenant_id: IDS.tenant,
        campus_id: IDS.campus,
        license_plate: "KDA PLAY",
        model: "Toyota Coaster",
        capacity: 30,
        status: "Active",
        active_driver_id: IDS.driver,
        conductor_1_id: IDS.conductor,
      },
      { onConflict: "id" }
    );
    if (vehicleError) throw new Error(vehicleError.message);

    const { error: routeError } = await client.from("routes").upsert(
      {
        id: IDS.route,
        tenant_id: IDS.tenant,
        campus_id: IDS.campus,
        name: "Play Review Corridor",
        path: lineWkt(pathPts),
      },
      { onConflict: "id" }
    );
    if (routeError) throw new Error(routeError.message);

    const { error: stopsError } = await client.from("stops").upsert(
      [
        {
          id: IDS.stop1,
          tenant_id: IDS.tenant,
          campus_id: IDS.campus,
          route_id: IDS.route,
          name: "Stop Riverside",
          location: pointWkt(STOP1.lng, STOP1.lat),
          sequence_no: 1,
          stop_type: "PICKUP",
        },
        {
          id: IDS.stop2,
          tenant_id: IDS.tenant,
          campus_id: IDS.campus,
          route_id: IDS.route,
          name: "Stop Market",
          location: pointWkt(STOP2.lng, STOP2.lat),
          sequence_no: 2,
          stop_type: "PICKUP",
        },
        {
          id: IDS.stop3,
          tenant_id: IDS.tenant,
          campus_id: IDS.campus,
          route_id: IDS.route,
          name: "Stop Park",
          location: pointWkt(STOP3.lng, STOP3.lat),
          sequence_no: 3,
          stop_type: "PICKUP",
        },
        {
          id: IDS.stopGate,
          tenant_id: IDS.tenant,
          campus_id: IDS.campus,
          route_id: IDS.route,
          name: "Play Review Gate",
          location: pointWkt(CAMPUS.lng, CAMPUS.lat),
          sequence_no: 4,
          stop_type: "DROPOFF",
        },
      ],
      { onConflict: "id" }
    );
    if (stopsError) throw new Error(stopsError.message);

    // Day window 08:00–17:00 so Play reviewers can start a trip any daytime hour.
    const dayWindowScheduleIds = [
      IDS.schedAm,
      IDS.schedMidMorning,
      IDS.schedMidday,
      IDS.schedMidAfternoon,
      IDS.schedPm,
    ];
    const { error: schedError } = await client.from("schedules").upsert(
      [
        {
          id: IDS.schedAm,
          tenant_id: IDS.tenant,
          campus_id: IDS.campus,
          route_id: IDS.route,
          vehicle_id: IDS.vehicle,
          name: "Play Review Morning",
          departure_time: "08:00",
          direction: "HOME_TO_SCHOOL",
          target_grades: ["Grade 1", "Grade 2", "Grade 3", "Grade 4"],
          days_of_week: [1, 2, 3, 4, 5, 6, 7],
        },
        {
          id: IDS.schedMidMorning,
          tenant_id: IDS.tenant,
          campus_id: IDS.campus,
          route_id: IDS.route,
          vehicle_id: IDS.vehicle,
          name: "Play Review Mid-Morning",
          departure_time: "10:00",
          direction: "HOME_TO_SCHOOL",
          target_grades: ["Grade 1", "Grade 2", "Grade 3", "Grade 4"],
          days_of_week: [1, 2, 3, 4, 5, 6, 7],
        },
        {
          id: IDS.schedMidday,
          tenant_id: IDS.tenant,
          campus_id: IDS.campus,
          route_id: IDS.route,
          vehicle_id: IDS.vehicle,
          name: "Play Review Midday",
          departure_time: "12:00",
          direction: "HOME_TO_SCHOOL",
          target_grades: ["Grade 1", "Grade 2", "Grade 3", "Grade 4"],
          days_of_week: [1, 2, 3, 4, 5, 6, 7],
        },
        {
          id: IDS.schedMidAfternoon,
          tenant_id: IDS.tenant,
          campus_id: IDS.campus,
          route_id: IDS.route,
          vehicle_id: IDS.vehicle,
          name: "Play Review Mid-Afternoon",
          departure_time: "14:00",
          direction: "SCHOOL_TO_HOME",
          target_grades: ["Grade 1", "Grade 2", "Grade 3", "Grade 4"],
          days_of_week: [1, 2, 3, 4, 5, 6, 7],
        },
        {
          id: IDS.schedPm,
          tenant_id: IDS.tenant,
          campus_id: IDS.campus,
          route_id: IDS.route,
          vehicle_id: IDS.vehicle,
          name: "Play Review Afternoon",
          departure_time: "17:00",
          direction: "SCHOOL_TO_HOME",
          target_grades: ["Grade 1", "Grade 2", "Grade 3", "Grade 4"],
          days_of_week: [1, 2, 3, 4, 5, 6, 7],
        },
      ],
      { onConflict: "id" }
    );
    if (schedError) throw new Error(schedError.message);

    const { error: studentsError } = await client.from("students").upsert(
      [
        {
          id: IDS.student1,
          tenant_id: IDS.tenant,
          campus_id: IDS.campus,
          name: "Brian Review",
          parent_id: IDS.parent,
          route_id: IDS.route,
          pickup_stop_id: IDS.stop1,
          dropoff_stop_id: IDS.stopGate,
          schedule_ids: dayWindowScheduleIds,
          nfc_card_hash: "PLAY-NFC-0001",
          grade: "Grade 4",
          class_name: "4 Blue",
          status: "Present",
          guardians: [{ name: "Play Review Parent", phone: PLAY_REVIEW_PARENT_PHONE }],
          pickup_location: pointWkt(STOP1.lng, STOP1.lat),
          address: "Near Stop Riverside, Nairobi",
        },
        {
          id: IDS.student2,
          tenant_id: IDS.tenant,
          campus_id: IDS.campus,
          name: "Grace Review",
          parent_id: IDS.parent,
          route_id: IDS.route,
          pickup_stop_id: IDS.stop1,
          dropoff_stop_id: IDS.stopGate,
          schedule_ids: dayWindowScheduleIds,
          nfc_card_hash: "PLAY-NFC-0002",
          grade: "Grade 2",
          class_name: "2 Green",
          status: "Present",
          guardians: [{ name: "Play Review Parent", phone: PLAY_REVIEW_PARENT_PHONE }],
          pickup_location: pointWkt(STOP1.lng + 0.0002, STOP1.lat + 0.0002),
          address: "Near Stop Riverside, Nairobi",
        },
        {
          id: IDS.student3,
          tenant_id: IDS.tenant,
          campus_id: IDS.campus,
          name: "Amina Review",
          parent_id: IDS.parent2,
          route_id: IDS.route,
          pickup_stop_id: IDS.stop2,
          dropoff_stop_id: IDS.stopGate,
          schedule_ids: dayWindowScheduleIds,
          nfc_card_hash: "PLAY-NFC-0003",
          grade: "Grade 3",
          class_name: "3 Blue",
          status: "Present",
          guardians: [{ name: "Play Review Parent Two", phone: "+254700000004" }],
          pickup_location: pointWkt(STOP2.lng, STOP2.lat),
          address: "Near Stop Market, Nairobi",
        },
        {
          id: IDS.student4,
          tenant_id: IDS.tenant,
          campus_id: IDS.campus,
          name: "David Review",
          parent_id: IDS.parent2,
          route_id: IDS.route,
          pickup_stop_id: IDS.stop3,
          dropoff_stop_id: IDS.stopGate,
          schedule_ids: dayWindowScheduleIds,
          nfc_card_hash: "PLAY-NFC-0004",
          grade: "Grade 5",
          class_name: "5 Green",
          status: "Present",
          guardians: [{ name: "Play Review Parent Two", phone: "+254700000004" }],
          pickup_location: pointWkt(STOP3.lng, STOP3.lat),
          address: "Near Stop Park, Nairobi",
        },
        {
          id: IDS.student5,
          tenant_id: IDS.tenant,
          campus_id: IDS.campus,
          name: "Elena Review",
          parent_id: IDS.parent,
          route_id: IDS.route,
          pickup_stop_id: IDS.stop2,
          dropoff_stop_id: IDS.stopGate,
          schedule_ids: dayWindowScheduleIds,
          nfc_card_hash: "PLAY-NFC-0005",
          grade: "Grade 1",
          class_name: "1 Blue",
          status: "Present",
          guardians: [{ name: "Play Review Parent", phone: PLAY_REVIEW_PARENT_PHONE }],
          pickup_location: pointWkt(STOP2.lng + 0.0001, STOP2.lat + 0.0001),
          address: "Near Stop Market, Nairobi",
        },
      ],
      { onConflict: "id" }
    );
    if (studentsError) throw new Error(studentsError.message);

    // Leave trips as scheduled (API auto-creates today's runs). Do not pre-start
    // a trip so Play reviewers can tap Start Trip during the 08:00–17:00 window.

    try {
      await client.from("live_coordinates").insert(
        pathPts.slice(0, 3).map((pt, i) => ({
          tenant_id: IDS.tenant,
          vehicle_id: IDS.vehicle,
          route_id: IDS.route,
          coordinates: pointWkt(pt.lng, pt.lat),
          speed: 28 + i,
          bearing: 155,
          created_at: new Date(Date.now() - (10 - i * 2) * 60 * 1000).toISOString(),
        }))
      );
    } catch {
      /* non-fatal */
    }

    return {
      tenantId: IDS.tenant,
      slug: PLAY_REVIEW_SLUG,
      schoolUrl: getTenantPublicUrl(PLAY_REVIEW_SLUG, "/login"),
      adminEmail: PLAY_REVIEW_ADMIN_EMAIL,
      adminPassword,
      driverPhone: PLAY_REVIEW_DRIVER_PHONE,
      parentPhone: PLAY_REVIEW_PARENT_PHONE,
      otp: PLAY_REVIEW_OTP,
      neverExpires: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Play review provision failed";
    return { error: message };
  }
}
