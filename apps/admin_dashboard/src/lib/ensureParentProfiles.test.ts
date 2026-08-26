import { describe, expect, it, vi } from "vitest";
import { ensureParentProfilesFromGuardians } from "@/lib/ensureParentProfiles";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("ensureParentProfilesFromGuardians", () => {
  it("inserts a parent when phone is new", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: (table: string) => {
        expect(table).toBe("profiles");
        return {
          select: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({
                  data: [],
                  error: null,
                }),
            }),
          }),
          insert,
          update: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          }),
        };
      },
    };

    const result = await ensureParentProfilesFromGuardians(
      client as unknown as SupabaseClient,
      "tenant-1",
      [{ name: "Jane", phone: "+254700111222", email: "jane@school.ke" }]
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parentId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    }
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({
      role: "parent",
      name: "Jane",
      phone: "+254700111222",
      email: "jane@school.ke",
      tenant_id: "tenant-1",
    });
  });

  it("updates an existing parent matched by phone", async () => {
    const updateEqTenant = vi.fn().mockResolvedValue({ error: null });
    const updateEqId = vi.fn().mockReturnValue({ eq: updateEqTenant });
    const update = vi.fn().mockReturnValue({ eq: updateEqId });
    const insert = vi.fn();

    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  {
                    id: "parent-existing",
                    phone: "+254700111222",
                    name: "Old",
                    email: "old@school.ke",
                  },
                ],
                error: null,
              }),
          }),
        }),
        insert,
        update,
      }),
    };

    const result = await ensureParentProfilesFromGuardians(
      client as unknown as SupabaseClient,
      "tenant-1",
      [{ name: "Jane", phone: "0700111222", email: "jane@school.ke" }]
    );

    expect(result).toEqual({ ok: true, parentId: "parent-existing" });
    expect(insert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      name: "Jane",
      email: "jane@school.ke",
      phone: "+254700111222",
    });
  });
});
