import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingleProfile = vi.fn();
const maybeSingleStudent = vi.fn();
const upload = vi.fn();
const studentUpdate = vi.fn();
const profileUpdate = vi.fn();

function profilesQuery() {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: maybeSingleProfile }),
      }),
    }),
    update: (payload: unknown) => {
      profileUpdate(payload);
      return {
        eq: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    },
  };
}

function studentsQuery() {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: maybeSingleStudent }),
      }),
    }),
    update: (payload: unknown) => {
      studentUpdate(payload);
      return {
        eq: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    },
  };
}

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "profiles") return profilesQuery();
      if (table === "students") return studentsQuery();
      throw new Error(`Unexpected table ${table}`);
    },
    storage: {
      from: () => ({
        upload,
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://cdn.example/avatars/${path}` },
        }),
      }),
    },
  }),
}));

import { POST } from "@/app/api/parent/avatar/route";
import { signParentSession } from "@/lib/parentSession";

const PARENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const STUDENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function jpegBase64(): string {
  const buf = Buffer.alloc(64, 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf.toString("base64");
}

function authRequest(token: string | null, body: unknown) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new Request("http://localhost/api/parent/avatar", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/parent/avatar", () => {
  beforeEach(() => {
    process.env.PARENT_SESSION_SECRET = "unit-test-parent-secret";
    maybeSingleProfile.mockReset();
    maybeSingleStudent.mockReset();
    upload.mockReset();
    studentUpdate.mockReset();
    profileUpdate.mockReset();
    upload.mockResolvedValue({ error: null });
    maybeSingleProfile.mockResolvedValue({
      data: { id: PARENT_ID, phone: "+254700000001" },
      error: null,
    });
    profileUpdate.mockReturnValue(undefined);
    studentUpdate.mockReturnValue(undefined);
  });

  it("Given missing token, When uploading, Then 401", async () => {
    const res = await POST(authRequest(null, { target: "profiles", id: PARENT_ID, image_base64: jpegBase64() }));
    expect(res.status).toBe(401);
  });

  it("Given another profile id, When uploading a parent photo, Then 403", async () => {
    const session = signParentSession({ sub: PARENT_ID, tenant_id: TENANT_ID });
    const res = await POST(
      authRequest(session, {
        target: "profiles",
        id: STUDENT_ID,
        image_base64: jpegBase64(),
      })
    );
    expect(res.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
  });

  it("Given a linked child, When uploading a student photo, Then the file is stored and avatar_url is saved", async () => {
    maybeSingleStudent.mockResolvedValue({
      data: { id: STUDENT_ID, parent_id: PARENT_ID, guardians: [], tenant_id: TENANT_ID },
      error: null,
    });
    const session = signParentSession({ sub: PARENT_ID, tenant_id: TENANT_ID });
    const res = await POST(
      authRequest(session, {
        target: "students",
        id: STUDENT_ID,
        image_base64: jpegBase64(),
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; avatar_url: string };
    expect(json.success).toBe(true);
    expect(json.avatar_url).toContain("/avatars/");
    expect(upload).toHaveBeenCalled();
    expect(studentUpdate).toHaveBeenCalledWith(expect.objectContaining({ avatar_url: json.avatar_url }));
  });

  it("Given an unlinked student, When uploading, Then 403", async () => {
    maybeSingleStudent.mockResolvedValue({
      data: {
        id: STUDENT_ID,
        parent_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        guardians: [],
        tenant_id: TENANT_ID,
      },
      error: null,
    });
    const session = signParentSession({ sub: PARENT_ID, tenant_id: TENANT_ID });
    const res = await POST(
      authRequest(session, {
        target: "students",
        id: STUDENT_ID,
        image_base64: jpegBase64(),
      })
    );
    expect(res.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
  });
});
