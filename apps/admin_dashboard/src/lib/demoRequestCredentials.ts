export type DemoProvisionCredentials = {
  school_url: string;
  admin_email: string;
  admin_password: string;
  phone: string;
  otp: string;
  expires_at: string;
  slug: string;
};

const storageKey = (requestId: string) => `demo-request-creds:${requestId}`;

export function saveDemoProvisionCredentials(
  requestId: string,
  creds: DemoProvisionCredentials
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(requestId), JSON.stringify(creds));
  } catch {
    /* quota / private mode */
  }
}

export function loadDemoProvisionCredentials(
  requestId: string
): DemoProvisionCredentials | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(requestId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoProvisionCredentials;
    if (
      typeof parsed.school_url !== "string" ||
      typeof parsed.admin_email !== "string" ||
      typeof parsed.admin_password !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearDemoProvisionCredentials(requestId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(requestId));
  } catch {
    /* ignore */
  }
}
