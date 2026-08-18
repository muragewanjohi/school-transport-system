export type GuardianEntry = {
  name: string;
  phone: string;
};

export type ParentOption = {
  id: string;
  name: string;
  phone: string;
};

export type GuardianSourceMode = "existing" | "new";

export const DEFAULT_GUARDIAN_SOURCE_MODE: GuardianSourceMode = "existing";
export const MAX_GUARDIANS = 3;
export const GUARDIAN_PHONE_CODES = ["+254", "+256", "+255", "+250", "+1", "+44"] as const;
export const DUPLICATE_GUARDIAN_PHONE_MESSAGE =
  "Two guardians cannot share the same phone number.";

export function defaultGuardianSourceMode(): GuardianSourceMode {
  return DEFAULT_GUARDIAN_SOURCE_MODE;
}

export function shouldShowExistingParentDropdown(mode: GuardianSourceMode): boolean {
  return mode === "existing";
}

export function normalizeGuardianPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function canonicalizeGuardianPhone(phone: string): string {
  const digits = normalizeGuardianPhone(phone);
  return digits ? `+${digits}` : "";
}

export type ParentPhotoSource = {
  phone?: string | null;
  avatar_url?: string | null;
};

export type GuardianWithPhoto = {
  name: string;
  phone: string;
  photo_url: string | null;
};

export function parentPhotoIndex(
  parents: ParentPhotoSource[]
): Map<string, ParentPhotoSource> {
  const map = new Map<string, ParentPhotoSource>();
  for (const parent of parents) {
    const key = normalizeGuardianPhone(parent.phone ?? "");
    if (!key) continue;
    map.set(key, parent);
  }
  return map;
}

function firstNonEmptyUrl(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/** Attach `photo_url` from the matching parent profile, or null for a thumbnail fallback. */
export function attachGuardianPhotos(
  guardians: unknown,
  parentsByPhone: Map<string, ParentPhotoSource>
): GuardianWithPhoto[] {
  if (!Array.isArray(guardians)) return [];
  const out: GuardianWithPhoto[] = [];
  for (const raw of guardians) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const phone = typeof row.phone === "string" ? row.phone.trim() : "";
    if (!phone) continue;
    const name =
      typeof row.name === "string" && row.name.trim() ? row.name.trim() : "Guardian";
    const fromRow = firstNonEmptyUrl(row.photo_url, row.avatar_url);
    const fromProfile = firstNonEmptyUrl(
      parentsByPhone.get(normalizeGuardianPhone(phone))?.avatar_url
    );
    out.push({
      name,
      phone,
      photo_url: fromRow ?? fromProfile,
    });
  }
  return out;
}

export function filterParentsByName<T extends { name: string }>(
  parents: T[],
  query: string
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return parents;
  return parents.filter((parent) => parent.name.toLowerCase().includes(needle));
}

export function duplicateGuardianPhoneError(
  guardians: Array<{ phone: string }>
): string | null {
  const seen = new Set<string>();
  for (const guardian of guardians) {
    const key = normalizeGuardianPhone(guardian.phone);
    if (!key) continue;
    if (seen.has(key)) return DUPLICATE_GUARDIAN_PHONE_MESSAGE;
    seen.add(key);
  }
  return null;
}

export function phoneAlreadyOnGuardians(
  guardians: Array<{ phone: string }>,
  phone: string
): boolean {
  const key = normalizeGuardianPhone(phone);
  if (!key) return false;
  return guardians.some((guardian) => normalizeGuardianPhone(guardian.phone) === key);
}

export type AddExistingParentResult =
  | { ok: true; guardians: GuardianEntry[] }
  | { ok: false; error: string };

export function addExistingParentToGuardians(
  guardians: GuardianEntry[],
  parent: Pick<ParentOption, "name" | "phone">,
  max = MAX_GUARDIANS
): AddExistingParentResult {
  const phone = canonicalizeGuardianPhone(parent.phone);
  if (phoneAlreadyOnGuardians(guardians, phone)) {
    return { ok: false, error: DUPLICATE_GUARDIAN_PHONE_MESSAGE };
  }

  const next = guardians.map((guardian) => ({ ...guardian }));
  const emptyIdx = next.findIndex(
    (guardian) => !guardian.name.trim() && !normalizeGuardianPhone(guardian.phone)
  );
  const entry: GuardianEntry = { name: parent.name, phone };

  if (emptyIdx !== -1) {
    next[emptyIdx] = entry;
    return { ok: true, guardians: next };
  }
  if (next.length >= max) {
    return { ok: false, error: "Maximum of 3 guardians allowed." };
  }
  next.push(entry);
  return { ok: true, guardians: next };
}

export function validateGuardianEntries(guardians: GuardianEntry[]): string | null {
  for (let idx = 0; idx < guardians.length; idx += 1) {
    const guardian = guardians[idx];
    if (!guardian.name.trim()) {
      return `Guardian ${idx + 1} name is required`;
    }
    const phoneTrimmed = guardian.phone.trim();
    if (!phoneTrimmed) {
      return `Guardian ${idx + 1} phone number is required`;
    }
    let matchedCode = "";
    for (const code of GUARDIAN_PHONE_CODES) {
      if (phoneTrimmed.startsWith(code)) {
        matchedCode = code;
        break;
      }
    }
    const localPart = matchedCode
      ? phoneTrimmed.substring(matchedCode.length)
      : phoneTrimmed;
    if (!localPart) {
      return `Guardian ${idx + 1} phone number details are required`;
    }
    if (!/^\d+$/.test(localPart)) {
      return `Guardian ${idx + 1} phone number must consist of digits only`;
    }
    if (localPart.length < 7 || localPart.length > 11) {
      return `Guardian ${idx + 1} phone number is invalid (must be 7-11 digits)`;
    }
  }

  return duplicateGuardianPhoneError(guardians);
}

export function isParentOption(value: unknown): value is ParentOption {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.phone === "string" &&
    row.name.trim().length > 0 &&
    normalizeGuardianPhone(row.phone).length > 0
  );
}

export function parseParentOptions(data: unknown): ParentOption[] {
  if (!Array.isArray(data)) return [];
  return data.filter(isParentOption);
}
