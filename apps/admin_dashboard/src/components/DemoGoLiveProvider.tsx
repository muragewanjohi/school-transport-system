"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { isSchoolConsolePath } from "@/lib/tenantHost";
import { formatDemoExpiryLabel } from "@/lib/demoGoLive";

type DemoGoLiveData = {
  is_demo: boolean;
  demo_expires_at: string | null;
  demo_expiry_label: string | null;
  can_request_go_live: boolean;
  go_live_requested: boolean;
};

type DemoGoLiveContextType = {
  isDemoTenant: boolean;
  demoExpiresAt: string | null;
  demoExpiryLabel: string | null;
  canRequestGoLive: boolean;
  goLiveRequested: boolean;
  requesting: boolean;
  requestError: string | null;
  requestGoLive: () => Promise<boolean>;
};

const DemoGoLiveContext = createContext<DemoGoLiveContextType>({
  isDemoTenant: false,
  demoExpiresAt: null,
  demoExpiryLabel: null,
  canRequestGoLive: false,
  goLiveRequested: false,
  requesting: false,
  requestError: null,
  requestGoLive: async () => false,
});

export function useDemoGoLive() {
  return useContext(DemoGoLiveContext);
}

export function RequestToGoLiveButton({ compact = false }: { compact?: boolean }) {
  const { canRequestGoLive, goLiveRequested, requesting, requestGoLive } = useDemoGoLive();

  if (goLiveRequested) {
    return (
      <span className="demo-go-live-sent" role="status">
        Request sent — we will onboard your school
      </span>
    );
  }

  if (!canRequestGoLive) return null;

  return (
    <button
      type="button"
      className={compact ? "demo-tenant-banner-cta" : "btn-primary"}
      disabled={requesting}
      onClick={() => void requestGoLive()}
    >
      {requesting ? "Sending request…" : "Request to go live"}
    </button>
  );
}

export default function DemoGoLiveProvider({ children }: { children: ReactNode }) {
  const { profile, isDemoReadonly } = useAuth();
  const pathname = usePathname();
  const [data, setData] = useState<DemoGoLiveData | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!profile || profile.role !== "school_admin" || !profile.tenant_id) {
      setData(null);
      return;
    }
    try {
      const res = await fetch("/api/demo/go-live");
      const json = (await res.json()) as { success?: boolean; data?: DemoGoLiveData };
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    }
  }, [profile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const requestGoLive = useCallback(async () => {
    setRequesting(true);
    setRequestError(null);
    try {
      const res = await fetch("/api/demo/go-live", { method: "POST" });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        data?: DemoGoLiveData;
      };
      if (!res.ok || !json.success) {
        setRequestError(json.error || "Could not send the go-live request.");
        return false;
      }
      if (json.data) setData(json.data);
      else await refresh();
      return true;
    } catch {
      setRequestError("Could not send the go-live request.");
      return false;
    } finally {
      setRequesting(false);
    }
  }, [refresh]);

  const value = useMemo<DemoGoLiveContextType>(
    () => ({
      isDemoTenant: Boolean(data?.is_demo),
      demoExpiresAt: data?.demo_expires_at ?? null,
      demoExpiryLabel: data?.demo_expiry_label ?? (data?.is_demo ? formatDemoExpiryLabel(data.demo_expires_at) : null),
      canRequestGoLive: Boolean(data?.can_request_go_live),
      goLiveRequested: Boolean(data?.go_live_requested),
      requesting,
      requestError,
      requestGoLive,
    }),
    [data, requesting, requestError, requestGoLive]
  );

  const showBanner =
    value.isDemoTenant &&
    !isDemoReadonly &&
    isSchoolConsolePath(pathname);

  return (
    <DemoGoLiveContext.Provider value={value}>
      {showBanner ? (
        <div className="demo-tenant-banner" role="status">
          <span>
            <strong>Demo account.</strong> This is a time-boxed trial school — operational SMS
            is not sent to real parents. {value.demoExpiryLabel}.
          </span>
          <RequestToGoLiveButton compact />
          {requestError ? <span className="demo-tenant-banner-error">{requestError}</span> : null}
        </div>
      ) : null}
      {children}
    </DemoGoLiveContext.Provider>
  );
}
