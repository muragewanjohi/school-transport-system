"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deliveryForPhone,
  otpDeliveryLabel,
  type OtpDeliveryRow,
} from "@/lib/otpDeliveryStatus";

/** Loads the latest login-code attempt per profile for this school (once per page). */
export function useOtpDeliveries() {
  const [rows, setRows] = useState<OtpDeliveryRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/otp-deliveries")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { success?: boolean; data?: OtpDeliveryRow[] } | null) => {
        if (!cancelled && body?.success && Array.isArray(body.data)) setRows(body.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    const byProfile = new Map(rows.filter((r) => r.profile_id).map((r) => [r.profile_id as string, r]));
    return {
      forProfile: (profileId: string | null | undefined) => (profileId ? byProfile.get(profileId) ?? null : null),
      forPhone: (phone: string | null | undefined) => deliveryForPhone(rows, phone),
    };
  }, [rows]);
}

/** "Login code: SMS not delivered · UserInBlacklist · 10:42" — renders nothing without a row. */
export function OtpDeliveryChip({ delivery }: { delivery: OtpDeliveryRow | null }) {
  if (!delivery) return null;
  const label = otpDeliveryLabel(delivery);
  return (
    <span className={`otp-delivery-chip otp-delivery-chip--${label.tone}`} title={label.title}>
      {label.text}
    </span>
  );
}
