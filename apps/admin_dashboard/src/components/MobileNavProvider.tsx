"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { isMobileNavViewport, MOBILE_NAV_MAX_WIDTH_PX } from "@/lib/mobileNav";

type MobileNavContextValue = {
  isOpen: boolean;
  isMobileViewport: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

export function useMobileNav(): MobileNavContextValue {
  const ctx = useContext(MobileNavContext);
  if (!ctx) {
    throw new Error("useMobileNav must be used within MobileNavProvider");
  }
  return ctx;
}

/** Safe hook when Sidebar may render outside the provider (e.g. tests). */
export function useMobileNavOptional(): MobileNavContextValue {
  const ctx = useContext(MobileNavContext);
  const [isOpen, setIsOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    if (ctx) return;
    const sync = () => setIsMobileViewport(isMobileNavViewport(window.innerWidth));
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [ctx]);

  const fallback = useMemo<MobileNavContextValue>(
    () => ({
      isOpen,
      isMobileViewport,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((v) => !v),
    }),
    [isOpen, isMobileViewport]
  );

  return ctx ?? fallback;
}

export default function MobileNavProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    const sync = () => {
      const mobile = isMobileNavViewport(window.innerWidth);
      setIsMobileViewport(mobile);
      if (!mobile) setIsOpen(false);
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    if (!isOpen || !isMobileViewport) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen, isMobileViewport]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const value = useMemo(
    () => ({ isOpen, isMobileViewport, open, close, toggle }),
    [isOpen, isMobileViewport, open, close, toggle]
  );

  return (
    <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>
  );
}

export { MOBILE_NAV_MAX_WIDTH_PX };
