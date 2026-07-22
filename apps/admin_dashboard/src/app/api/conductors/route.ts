import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";

const conductorCreateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().min(5, "Phone number too short"),
  email: z.string().email("Invalid email format"),
  national_id: z.string().min(4, "National ID must be at least 4 characters"),
  status: z.enum(["Available", "Unavailable"]).default("Available"),
  avatar_url: z.string().optional().nullable(),
});

const mockConductors = [
  { id: "cnd-1", name: "Jane Wanjiku", phone: "+254 755 123 456", email: "jane.wanjiku@school.com", national_id: "29402941", status: "Available", avatar_url: null },
  { id: "cnd-2", name: "Sam Mutua", phone: "+254 788 321 654", email: "sam.mutua@school.com", national_id: "31049281", status: "Available", avatar_url: null },
  { id: "cnd-3", name: "Grace Nekesa", phone: "+254 744 789 012", email: "grace.nekesa@school.com", national_id: "32405912", status: "Available", avatar_url: null },
  { id: "cnd-4", name: "Lucy Wambui", phone: "+254 799 444 555", email: "lucy.wambui@school.com", national_id: "27409284", status: "Unavailable", avatar_url: null },
];

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: mockConductors });
    }

    const client = getSupabaseClient(token);
    
    const { data: conductors, error } = await client
      .from("profiles")
      .select("id, name, phone, email, national_id, status, avatar_url")
      .eq("role", "conductor");

    if (error) {
      console.warn("Supabase conductors fetch error (might lack columns):", error.message);
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: mockConductors });
    }

    const conductorsList = conductors && conductors.length > 0 ? conductors : mockConductors;
    return NextResponse.json({ success: true, source: "supabase", data: conductorsList });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const result = conductorCreateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      const newMockConductor = {
        id: `cnd-${Math.floor(Math.random() * 1000)}`,
        ...result.data,
      };
      return NextResponse.json({ success: true, source: "mock", data: newMockConductor });
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
      role: "conductor",
      name: result.data.name,
      phone: result.data.phone,
      email: result.data.email,
      national_id: result.data.national_id,
      status: result.data.status,
    };

    const { data: conductorInsert, error } = await client
      .from("profiles")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.warn("Supabase conductor insert error, falling back to mock save:", error.message);
      const mockConductor = {
        ...payload,
        id: `cnd-db-fallback-${Math.floor(Math.random() * 1000)}`
      };
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: mockConductor });
    }

    return NextResponse.json({ success: true, source: "supabase", data: conductorInsert });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
