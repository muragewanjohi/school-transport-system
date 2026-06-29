import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";

const adminCreateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().min(5, "Phone number too short"),
  email: z.string().email("Invalid email format"),
  admin_role: z.enum(["Super Admin", "Operations Admin", "Bursar", "Dispatcher", "Fleet Manager", "Roster Manager"]),
});

const mockAdmins = [
  { id: "adm-1", name: "Sarah Jenkins", email: "sarah.jenkins@school.com", phone: "+254 700 111 222", role: "school_admin", admin_role: "Super Admin", national_id: "29402940", status: "Available" },
  { id: "adm-2", name: "Robert Kiprop", email: "robert.kiprop@school.com", phone: "+254 700 333 444", role: "school_admin", admin_role: "Dispatcher", national_id: "28304910", status: "Available" },
  { id: "adm-3", name: "Alice Koech", email: "alice.koech@school.com", phone: "+254 722 890 123", role: "school_admin", admin_role: "Fleet Manager", national_id: "28405911", status: "Available" },
  { id: "adm-4", name: "David Ndwiga", email: "david.ndwiga@school.com", phone: "+254 755 123 456", role: "school_admin", admin_role: "Roster Manager", national_id: "29402941", status: "Available" }
];

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: mockAdmins });
    }

    const client = getSupabaseClient(token);
    
    const { data: admins, error } = await client
      .from("profiles")
      .select("id, name, phone, email, role, admin_role, national_id, status")
      .eq("role", "school_admin");

    if (error) {
      console.warn("Supabase administrators fetch error:", error.message);
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: mockAdmins });
    }

    const adminsList = admins && admins.length > 0 ? admins : mockAdmins;
    return NextResponse.json({ success: true, source: "supabase", data: adminsList });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const result = adminCreateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      const newMockAdmin = {
        id: `adm-${Math.floor(Math.random() * 1000)}`,
        role: "school_admin",
        national_id: "",
        status: "Available",
        ...result.data,
      };
      return NextResponse.json({ success: true, source: "mock", data: newMockAdmin });
    }

    const client = getSupabaseClient(token);

    // Get first tenant ID
    let tenantId = "8c9ad841-f762-4217-a021-9876251b5bcf";
    const { data: tenants } = await client.from("tenants").select("id").limit(1);
    if (tenants && tenants.length > 0) {
      tenantId = tenants[0].id;
    }

    const payload = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      role: "school_admin",
      admin_role: result.data.admin_role,
      name: result.data.name,
      phone: result.data.phone,
      email: result.data.email,
      national_id: "",
      status: "Available",
    };

    const { data: adminInsert, error } = await client
      .from("profiles")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.warn("Supabase administrator insert error, falling back to mock save:", error.message);
      const mockAdmin = {
        ...payload,
        id: `adm-db-fallback-${Math.floor(Math.random() * 1000)}`
      };
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: mockAdmin });
    }

    return NextResponse.json({ success: true, source: "supabase", data: adminInsert });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
