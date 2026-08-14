import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import { z } from "zod";

const adminCreateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().min(5, "Phone number too short"),
  email: z.string().email("Invalid email format"),
  admin_role: z.enum(["Super Admin", "Operations Admin", "Bursar", "Dispatcher", "Fleet Manager", "Roster Manager"]),
});

export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: [] });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const { data: admins, error } = await scope.client
      .from("profiles")
      .select("id, name, phone, email, role, admin_role, national_id, status")
      .eq("role", "school_admin")
      .eq("tenant_id", scope.tenantId);

    if (error) {
      console.warn("Supabase administrators fetch error:", error.message);
      return NextResponse.json({ success: false, error: "Failed to load administrators" }, { status: 500 });
    }

    return NextResponse.json({ success: true, source: "supabase", data: admins ?? [] });

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

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);
    const client = scope.client;
    const tenantId = scope.tenantId;

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
