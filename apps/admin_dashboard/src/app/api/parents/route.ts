import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";

const mockParents = [
  { id: "prt-1", name: "James Mwangi", phone: "+254 700 111 222", email: "james.mwangi@parent.com" },
  { id: "prt-2", name: "Mary Kamau", phone: "+254 711 222 333", email: "mary.kamau@parent.com" },
  { id: "prt-3", name: "Alice Ochieng", phone: "+254 722 333 444", email: "alice.ochieng@parent.com" },
  { id: "prt-4", name: "Robert Ndwiga", phone: "+254 733 444 555", email: "robert.ndwiga@parent.com" },
];

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: mockParents });
    }

    const client = getSupabaseClient(token);
    
    const { data: parents, error } = await client
      .from("profiles")
      .select("id, name, phone, email")
      .eq("role", "parent");

    if (error) {
      console.warn("Supabase parents fetch error:", error.message);
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: mockParents });
    }

    const parentsList = parents && parents.length > 0 ? parents : mockParents;
    return NextResponse.json({ success: true, source: "supabase", data: parentsList });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
