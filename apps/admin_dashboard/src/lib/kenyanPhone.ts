export function normalizeKenyanPhone(phone: string): string {
  const compact = phone.replace(/[\s()-]+/g, "");
  if (compact.startsWith("0")) return `+254${compact.slice(1)}`;
  if (compact.startsWith("+")) return compact;
  return `+${compact}`;
}

export function phoneVariants(phone: string): string[] {
  const normalized = normalizeKenyanPhone(phone);
  const local = normalized.startsWith("+254") ? normalized.slice(4) : "";
  if (local.length !== 9) return [normalized];
  return [
    normalized,
    `+254 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`,
    `0${local}`,
    local,
  ];
}

export function phoneFilterOrClause(phone: string): string {
  return phoneVariants(phone)
    .map((candidate) => `phone.eq.${candidate}`)
    .join(",");
}
