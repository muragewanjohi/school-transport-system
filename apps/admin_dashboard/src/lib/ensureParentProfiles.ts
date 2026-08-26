import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canonicalizeGuardianPhone,
  guardianPhonesMatch,
  type GuardianEntry,
} from "@/lib/studentGuardians";

export type ParentProfileRow = {
  id: string;
  phone: string | null;
  name?: string | null;
  email?: string | null;
};

function storeGuardianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length >= 9) {
    return `+254${digits.slice(1)}`;
  }
  return canonicalizeGuardianPhone(phone);
}

/**
 * Insert or update tenant-scoped parent profiles from student guardians.
 * Returns the profile id for the first guardian (primary parent_id).
 */
export async function ensureParentProfilesFromGuardians(
  client: SupabaseClient,
  tenantId: string,
  guardians: GuardianEntry[]
): Promise<{ ok: true; parentId: string | null } | { ok: false; error: string }> {
  if (guardians.length === 0) {
    return { ok: true, parentId: null };
  }

  const { data: existingRows, error: listError } = await client
    .from("profiles")
    .select("id, phone, name, email")
    .eq("role", "parent")
    .eq("tenant_id", tenantId);

  if (listError) {
    return { ok: false, error: listError.message };
  }

  const existing = (existingRows ?? []) as ParentProfileRow[];
  let primaryParentId: string | null = null;

  for (const guardian of guardians) {
    const phone = storeGuardianPhone(guardian.phone);
    const email = guardian.email.trim().toLowerCase();
    const name = guardian.name.trim();
    if (!phone || !email || !name) {
      return { ok: false, error: "Each guardian requires name, phone, and email" };
    }

    const match = existing.find(
      (row) => row.phone && guardianPhonesMatch(phone, row.phone)
    );

    if (match) {
      const { error: updateError } = await client
        .from("profiles")
        .update({ name, email, phone })
        .eq("id", match.id)
        .eq("tenant_id", tenantId);

      if (updateError) {
        return { ok: false, error: updateError.message };
      }

      match.name = name;
      match.email = email;
      match.phone = phone;
      if (!primaryParentId) primaryParentId = match.id;
      continue;
    }

    const id = crypto.randomUUID();
    const { error: insertError } = await client.from("profiles").insert({
      id,
      tenant_id: tenantId,
      role: "parent",
      name,
      phone,
      email,
      status: "Available",
    });

    if (insertError) {
      return { ok: false, error: insertError.message };
    }

    existing.push({ id, phone, name, email });
    if (!primaryParentId) primaryParentId = id;
  }

  return { ok: true, parentId: primaryParentId };
}
