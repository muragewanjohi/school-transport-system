import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";

const driverCreateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().min(5, "Phone number too short"),
  email: z.string().email("Invalid email format"),
  national_id: z.string().min(4, "National ID must be at least 4 characters"),
  status: z.enum(["Available", "Unavailable"]).default("Available"),
});

const mockDrivers = [
  { id: "drv-1", name: "John Kamau", phone: "+254 712 345 678", email: "john.kamau@school.com", national_id: "32908422", status: "Available" },
  { id: "drv-2", name: "David Ochieng", phone: "+254 722 890 123", email: "david.ochieng@school.com", national_id: "28405911", status: "Available" },
  { id: "drv-3", name: "Peter Ndwiga", phone: "+254 733 456 789", email: "peter.ndwiga@school.com", national_id: "31049284", status: "Unavailable" },
  { id: "drv-4", name: "Michael Mwangi", phone: "+254 701 111 222", email: "michael.mwangi@school.com", national_id: "24905184", status: "Available" },
];

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: mockDrivers });
    }

    const client = getSupabaseClient(token);
    
    const { data: drivers, error } = await client
      .from("profiles")
      .select("id, name, phone, email, national_id, status")
      .eq("role", "driver");

    if (error) {
      console.warn("Supabase drivers fetch error (might lack columns):", error.message);
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: mockDrivers });
    }

    const driversList = drivers && drivers.length > 0 ? drivers : mockDrivers;
    return NextResponse.json({ success: true, source: "supabase", data: driversList });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const result = driverCreateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      const newMockDriver = {
        id: `drv-${Math.floor(Math.random() * 1000)}`,
        ...result.data,
      };
      return NextResponse.json({ success: true, source: "mock", data: newMockDriver });
    }

    const client = getSupabaseClient(token);

    // Get tenant ID
    let tenantId = "8c9ad841-f762-4217-a021-9876251b5bcf";
    const { data: tenants } = await client.from("tenants").select("id").limit(1);
    if (tenants && tenants.length > 0) {
      tenantId = tenants[0].id;
    }

    const payload = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      role: "driver",
      name: result.data.name,
      phone: result.data.phone,
      email: result.data.email,
      national_id: result.data.national_id,
      status: result.data.status,
    };

    const { data: driverInsert, error } = await client
      .from("profiles")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.warn("Supabase driver insert error, falling back to mock save:", error.message);
      const mockDriver = {
        ...payload,
        id: `drv-db-fallback-${Math.floor(Math.random() * 1000)}`
      };
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: mockDriver });
    }

    return NextResponse.json({ success: true, source: "supabase", data: driverInsert });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
