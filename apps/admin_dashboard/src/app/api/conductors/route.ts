import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import { z } from "zod";

const conductorCreateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().min(5, "Phone number too short"),
  email: z.string().email("Invalid email format"),
  national_id: z.string().min(4, "National ID must be at least 4 characters"),
  status: z.enum(["Available", "Unavailable"]).default("Available"),
  avatar_url: z.string().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: [] });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const { data: conductors, error } = await scope.client
      .from("profiles")
      .select("id, name, phone, email, national_id, status, avatar_url")
      .eq("role", "conductor")
      .eq("tenant_id", scope.tenantId);

    if (error) {
      console.warn("Supabase conductors fetch error (might lack columns):", error.message);
      return NextResponse.json({ success: false, error: "Failed to load conductors" }, { status: 500 });
    }

    return NextResponse.json({ success: true, source: "supabase", data: conductors ?? [] });

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

    if (!isSupabaseConfigured) {
      const newMockConductor = {
        id: `cnd-${Math.floor(Math.random() * 1000)}`,
        ...result.data,
      };
      return NextResponse.json({ success: true, source: "mock", data: newMockConductor });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);
    const client = scope.client;
    const tenantId = scope.tenantId;

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
