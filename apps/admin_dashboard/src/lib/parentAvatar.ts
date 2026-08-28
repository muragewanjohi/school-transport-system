import { guardianPhonesMatch } from "@/lib/studentGuardians";
import { studentLinkedToParent } from "@/lib/parentChildren";

export const AVATAR_MAX_BYTES = 3_500_000;

export type ParentAvatarTarget = "profiles" | "students" | "guardian";

export function decodeImageBase64(raw: string): Buffer | null {
  const trimmed = raw.trim();
  const comma = trimmed.indexOf(",");
  const payload = trimmed.startsWith("data:") && comma >= 0 ? trimmed.slice(comma + 1) : trimmed;
  if (!payload) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(payload, "base64");
  } catch {
    return null;
  }
  if (buf.length < 32 || buf.length > AVATAR_MAX_BYTES) return null;
  if (!looksLikeImage(buf)) return null;
  return buf;
}

export function looksLikeImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return true;
  return false;
}

export function imageContentType(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0x52 && buf[1] === 0x49) return "image/webp";
  return "image/jpeg";
}

export function avatarObjectPath(
  ownerUserId: string,
  targetKey: string,
  entityId: string,
  nowMs = Date.now()
): string {
  return `${ownerUserId}/${targetKey}_${entityId}_${nowMs}.jpg`;
}

export function canEditStudentAvatar(input: {
  parentId: string;
  parentPhone: string;
  student: { parent_id?: string | null; guardians?: unknown };
}): boolean {
  return studentLinkedToParent(input);
}

export function withGuardianAvatarUrl(input: {
  guardians: unknown;
  guardianPhone: string;
  avatarUrl: string | null;
}): Record<string, unknown>[] {
  if (!Array.isArray(input.guardians)) return [];
  let matched = false;
  const out: Record<string, unknown>[] = [];
  for (const raw of input.guardians) {
    if (!raw || typeof raw !== "object") continue;
    const row = { ...(raw as Record<string, unknown>) };
    const phone = typeof row.phone === "string" ? row.phone : "";
    if (!matched && guardianPhonesMatch(phone, input.guardianPhone)) {
      row.avatar_url = input.avatarUrl;
      matched = true;
    }
    out.push(row);
  }
  return out;
}
