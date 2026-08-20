import { guardianPhonesMatch } from "@/lib/studentGuardians";

export type ParentChildGuardian = {
  phone?: string;
};

export type ParentChildStudent = {
  id?: string;
  parent_id?: string | null;
  guardians?: unknown;
};

export function matchParentIdForGuardians(
  guardians: Array<{ phone: string }>,
  parents: Array<{ id: string; phone: string | null }>
): string | null {
  for (const guardian of guardians) {
    const match = parents.find(
      (parent) => parent.phone && guardianPhonesMatch(guardian.phone, parent.phone)
    );
    if (match) return match.id;
  }
  return null;
}

export function guardianList(raw: unknown): ParentChildGuardian[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is ParentChildGuardian => Boolean(row) && typeof row === "object");
}

export function studentLinkedToParent(input: {
  parentId: string;
  parentPhone: string;
  student: ParentChildStudent;
}): boolean {
  if (input.student.parent_id && input.student.parent_id === input.parentId) {
    return true;
  }
  if (!input.parentPhone) return false;
  return guardianList(input.student.guardians).some(
    (guardian) => typeof guardian.phone === "string" && guardianPhonesMatch(guardian.phone, input.parentPhone)
  );
}

export function mergeParentChildRows<T extends ParentChildStudent>(
  linked: T[],
  unlinked: T[],
  parentId: string,
  parentPhone: string
): T[] {
  const extra = unlinked.filter((student) =>
    studentLinkedToParent({ parentId, parentPhone, student })
  );
  const seen = new Set(linked.map((row) => row.id).filter((id): id is string => Boolean(id)));
  const merged = [...linked];
  for (const row of extra) {
    if (row.id && seen.has(row.id)) continue;
    if (row.id) seen.add(row.id);
    merged.push(row);
  }
  return merged;
}
