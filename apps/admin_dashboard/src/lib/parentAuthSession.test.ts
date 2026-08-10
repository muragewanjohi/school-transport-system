import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserById = vi.fn();
const createUser = vi.fn();
const updateUserById = vi.fn();
const signInWithPassword = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { signInWithPassword },
  }),
}));

import { ensureParentAuthSession } from "@/lib/parentAuthSession";

describe("ensureParentAuthSession", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    getUserById.mockReset();
    createUser.mockReset();
    updateUserById.mockReset();
    signInWithPassword.mockReset();
  });

  it("Given no auth user, When ensuring session, Then creates user and returns tokens", async () => {
    getUserById.mockResolvedValue({ data: { user: null }, error: { message: "User not found" } });
    createUser.mockResolvedValue({ data: { user: { id: "pid" } }, error: null });
    signInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 3600,
          user: { id: "pid" },
        },
      },
      error: null,
    });

    const admin = {
      auth: {
        admin: { getUserById, createUser, updateUserById },
      },
    };

    const tokens = await ensureParentAuthSession(admin as never, {
      profileId: "pid",
      tenantId: "tid",
      name: "Ada",
      phone: "+254700000000",
    });

    expect(createUser).toHaveBeenCalled();
    expect(createUser.mock.calls[0][0]).toMatchObject({
      id: "pid",
      email_confirm: true,
      app_metadata: { role: "parent", tenant_id: "tid" },
      user_metadata: { role: "parent", tenant_id: "tid" },
    });
    expect(tokens.supabase_access_token).toBe("access");
    expect(tokens.supabase_refresh_token).toBe("refresh");
    expect(tokens.supabase_user_id).toBe("pid");
  });

  it("Given existing auth user, When ensuring session, Then updates password/metadata", async () => {
    getUserById.mockResolvedValue({
      data: { user: { id: "pid", email: "old@x.com" } },
      error: null,
    });
    updateUserById.mockResolvedValue({ data: { user: { id: "pid" } }, error: null });
    signInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: "a2",
          refresh_token: "r2",
          expires_in: 3600,
          user: { id: "pid" },
        },
      },
      error: null,
    });

    const admin = {
      auth: {
        admin: { getUserById, createUser, updateUserById },
      },
    };

    const tokens = await ensureParentAuthSession(admin as never, {
      profileId: "pid",
      tenantId: "tid",
    });

    expect(createUser).not.toHaveBeenCalled();
    expect(updateUserById).toHaveBeenCalled();
    expect(tokens.supabase_refresh_token).toBe("r2");
  });
});
