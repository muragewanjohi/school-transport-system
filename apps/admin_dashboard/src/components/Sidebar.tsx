"use client";

import React, { useEffect, Suspense } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { ThemeToggle } from "@/components/ThemeProvider";
import { useMobileNavOptional } from "@/components/MobileNavProvider";
import { shouldCloseMobileNavOnNavigate } from "@/lib/mobileNav";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Navigation,
  Bus,
  UserCheck,
  Compass,
  Settings,
  LogOut,
  Users,
  ChevronDown,
  ChevronRight,
  User,
  MapPin,
  Shield,
  CreditCard,
  Clock,
  Building2,
  BellRing,
  School,
  Menu,
  X,
  Edit3,
} from "lucide-react";
import {
  isRoutesSectionNavActive,
  isSchoolCampusNavActive,
  isTripsSectionNavActive,
  SCHOOL_CAMPUS_PATH,
  TRIPS_HISTORY_PATH,
  TRIPS_OVERRIDE_PATH,
} from "@/lib/schoolCampusNav";

export default function Sidebar() {
  return (
    <Suspense
      fallback={
        <aside className="sidebar" aria-hidden>
          <div className="sidebar-brand">
            <img
              src="/logo.png"
              alt="OnTheBus"
              className="brand-logo"
              width={200}
              height={72}
            />
          </div>
        </aside>
      }
    >
      <SidebarContent />
    </Suspense>
  );
}

function SidebarContent() {
  const { profile, signOut } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const { isOpen, isMobileViewport, close, toggle } = useMobileNavOptional();

  const [staffExpanded, setStaffExpanded] = React.useState(false);
  const [routesExpanded, setRoutesExpanded] = React.useState(false);
  const [tripsExpanded, setTripsExpanded] = React.useState(false);
  const [pendingDemoRequests, setPendingDemoRequests] = React.useState(0);

  useEffect(() => {
    if (pathname.startsWith("/staff")) {
      setStaffExpanded(true);
    }
    if (isRoutesSectionNavActive(pathname, tabParam)) {
      setRoutesExpanded(true);
    }
    if (isTripsSectionNavActive(pathname)) {
      setTripsExpanded(true);
    }
  }, [pathname, tabParam]);

  useEffect(() => {
    if (
      shouldCloseMobileNavOnNavigate({
        isMobileViewport,
        isOpen,
        pathnameChanged: true,
      })
    ) {
      close();
    }
    // Close only when the route location changes — not when isOpen flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: pathname/tab drive close
  }, [pathname, tabParam]);

  useEffect(() => {
    if (profile?.role !== "super_admin") return;

    let cancelled = false;
    const loadPendingDemoRequests = async () => {
      try {
        const response = await fetch("/api/demo-requests?summary=1");
        const json = await response.json();
        if (!cancelled && json.success) {
          setPendingDemoRequests(
            Number(json.data?.pending_count ?? json.data?.attention_count) || 0
          );
        }
      } catch {
        // Keep navigation usable when notification loading fails.
      }
    };

    void loadPendingDemoRequests();
    const interval = window.setInterval(loadPendingDemoRequests, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [profile?.role]);

  const onNavClick = () => {
    if (isMobileViewport) close();
  };

  return (
    <>
      <header className="mobile-shell-bar">
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-label={isOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={isOpen}
          aria-controls="console-sidebar"
          onClick={toggle}
        >
          {isOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <img
          src="/logo.png"
          alt="OnTheBus"
          className="mobile-shell-logo"
          width={140}
          height={40}
        />
        <span className="mobile-shell-spacer" aria-hidden />
      </header>

      <button
        type="button"
        className={`sidebar-backdrop${isOpen ? " is-visible" : ""}`}
        aria-label="Close navigation"
        tabIndex={isOpen ? 0 : -1}
        onClick={close}
      />

      <aside
        id="console-sidebar"
        className={`sidebar${isOpen ? " is-open" : ""}`}
        aria-hidden={isMobileViewport && !isOpen ? true : undefined}
      >
        <div className="sidebar-brand">
          <img
            src="/logo.png"
            alt="OnTheBus"
            className="brand-logo"
            width={200}
            height={72}
          />
          <button
            type="button"
            className="sidebar-close-btn"
            aria-label="Close navigation"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-menu">
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            {profile?.role === "super_admin" && (
              <>
                <li>
                  <Link
                    href="/schools"
                    onClick={onNavClick}
                    className={`menu-item ${pathname === "/schools" && (!tabParam || tabParam === "schools") ? "active" : ""}`}
                  >
                    <Building2 size={18} />
                    <span>Schools</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/schools?tab=demos"
                    onClick={onNavClick}
                    className={`menu-item ${pathname === "/schools" && tabParam === "demos" ? "active" : ""}`}
                  >
                    <BellRing size={18} />
                    <span>Demo Requests</span>
                    {pendingDemoRequests > 0 && (
                      <span
                        aria-label={`${pendingDemoRequests} pending demo requests`}
                        style={{
                          marginLeft: "auto",
                          minWidth: 20,
                          height: 20,
                          padding: "0 6px",
                          borderRadius: 999,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "var(--state-error)",
                          color: "white",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                        }}
                      >
                        {pendingDemoRequests > 99 ? "99+" : pendingDemoRequests}
                      </span>
                    )}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/schools?tab=billing"
                    onClick={onNavClick}
                    className={`menu-item ${pathname === "/schools" && tabParam === "billing" ? "active" : ""}`}
                  >
                    <CreditCard size={18} />
                    <span>Billing</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/schools?tab=settings"
                    onClick={onNavClick}
                    className={`menu-item ${pathname === "/schools" && tabParam === "settings" ? "active" : ""}`}
                  >
                    <Settings size={18} />
                    <span>Platform Settings</span>
                  </Link>
                </li>
              </>
            )}

            {profile?.role !== "super_admin" && (
              <>
                <li>
                  <Link
                    href="/dashboard"
                    onClick={onNavClick}
                    className={`menu-item ${pathname === "/dashboard" ? "active" : ""}`}
                  >
                    <Navigation size={18} />
                    <span>Real-time Tracking</span>
                  </Link>
                </li>

                <li>
                  <Link
                    href="/fleet"
                    onClick={onNavClick}
                    className={`menu-item ${pathname === "/fleet" ? "active" : ""}`}
                  >
                    <Bus size={18} />
                    <span>Fleet Management</span>
                  </Link>
                </li>

                <li>
                  <div
                    onClick={() => setStaffExpanded(!staffExpanded)}
                    className={`menu-item ${pathname.startsWith("/staff") ? "active" : ""}`}
                    style={{
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Users size={18} />
                      <span>Staff Roster</span>
                    </div>
                    {staffExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>

                  {staffExpanded && (
                    <ul
                      style={{
                        listStyle: "none",
                        paddingLeft: "24px",
                        marginTop: "4px",
                        marginBottom: "4px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                      }}
                    >
                      <li>
                        <Link
                          href="/staff/drivers"
                          onClick={onNavClick}
                          className={`menu-item ${pathname === "/staff/drivers" ? "active" : ""}`}
                          style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                        >
                          <User size={14} style={{ color: "var(--accent-primary)" }} />
                          <span>Manage Drivers</span>
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/staff/conductors"
                          onClick={onNavClick}
                          className={`menu-item ${pathname === "/staff/conductors" ? "active" : ""}`}
                          style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                        >
                          <User size={14} style={{ color: "var(--accent-secondary)" }} />
                          <span>Manage Conductors</span>
                        </Link>
                      </li>
                    </ul>
                  )}
                </li>

                <li>
                  <Link
                    href="/students"
                    onClick={onNavClick}
                    className={`menu-item ${pathname === "/students" ? "active" : ""}`}
                  >
                    <UserCheck size={18} />
                    <span>Student Roster</span>
                  </Link>
                </li>

                <li>
                  <div
                    onClick={() => setRoutesExpanded(!routesExpanded)}
                    className={`menu-item ${isRoutesSectionNavActive(pathname, tabParam) ? "active" : ""}`}
                    style={{
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Compass size={18} />
                      <span>Routes</span>
                    </div>
                    {routesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>

                  {routesExpanded && (
                    <ul
                      style={{
                        listStyle: "none",
                        paddingLeft: "24px",
                        marginTop: "4px",
                        marginBottom: "4px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                      }}
                    >
                      <li>
                        <Link
                          href="/routes"
                          onClick={onNavClick}
                          className={`menu-item ${pathname === "/routes" && tabParam !== "schools" ? "active" : ""}`}
                          style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                        >
                          <Compass size={14} style={{ color: "var(--accent-secondary)" }} />
                          <span>All Routes</span>
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/routes/stops"
                          onClick={onNavClick}
                          className={`menu-item ${pathname === "/routes/stops" ? "active" : ""}`}
                          style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                        >
                          <MapPin size={14} style={{ color: "var(--accent-primary)" }} />
                          <span>Stops & Stages</span>
                        </Link>
                      </li>
                    </ul>
                  )}
                </li>

                <li>
                  <div
                    onClick={() => setTripsExpanded(!tripsExpanded)}
                    className={`menu-item ${isTripsSectionNavActive(pathname) ? "active" : ""}`}
                    style={{
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Clock size={18} />
                      <span>Trips</span>
                    </div>
                    {tripsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>

                  {tripsExpanded && (
                    <ul
                      style={{
                        listStyle: "none",
                        paddingLeft: "24px",
                        marginTop: "4px",
                        marginBottom: "4px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                      }}
                    >
                      <li>
                        <Link
                          href={TRIPS_HISTORY_PATH}
                          onClick={onNavClick}
                          className={`menu-item ${pathname === TRIPS_HISTORY_PATH ? "active" : ""}`}
                          style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                        >
                          <Clock size={14} style={{ color: "var(--accent-secondary)" }} />
                          <span>Today&apos;s trip history</span>
                        </Link>
                      </li>
                      <li>
                        <Link
                          href={TRIPS_OVERRIDE_PATH}
                          onClick={onNavClick}
                          className={`menu-item ${pathname === TRIPS_OVERRIDE_PATH ? "active" : ""}`}
                          style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                        >
                          <Edit3 size={14} style={{ color: "var(--accent-primary)" }} />
                          <span>Override trip</span>
                        </Link>
                      </li>
                    </ul>
                  )}
                </li>

                {/* School Campus */}
                <li>
                  <Link
                    href={SCHOOL_CAMPUS_PATH}
                    onClick={onNavClick}
                    className={`menu-item ${isSchoolCampusNavActive(pathname, tabParam) ? "active" : ""}`}
                  >
                    <School size={18} />
                    <span>School Campus</span>
                  </Link>
                </li>

                {profile?.admin_role === "Super Admin" && (
                  <li>
                    <Link
                      href="/users"
                      onClick={onNavClick}
                      className={`menu-item ${pathname === "/users" ? "active" : ""}`}
                    >
                      <Shield size={18} />
                      <span>Admin Management</span>
                    </Link>
                  </li>
                )}

                <li>
                  <Link
                    href="/billing"
                    onClick={onNavClick}
                    className={`menu-item ${pathname.startsWith("/billing") ? "active" : ""}`}
                  >
                    <CreditCard size={18} />
                    <span>Billing & Plan</span>
                  </Link>
                </li>

                <li>
                  <Link
                    href="/config"
                    onClick={onNavClick}
                    className={`menu-item ${pathname === "/config" ? "active" : ""}`}
                  >
                    <Settings size={18} />
                    <span>System Config</span>
                  </Link>
                </li>
              </>
            )}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <ThemeToggle />
          {profile && (
            <div className="sidebar-profile">
              <div className="sidebar-profile-avatar">
                {profile.name.charAt(0).toUpperCase()}
              </div>
              <div className="sidebar-profile-meta">
                <span className="sidebar-profile-name">{profile.name}</span>
                <span className="sidebar-profile-role">
                  {profile.role === "super_admin"
                    ? "Platform Super Admin"
                    : profile.admin_role || "Administrator"}
                </span>
              </div>
            </div>
          )}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              close();
              signOut();
            }}
            className="menu-item"
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </a>
        </div>
      </aside>
    </>
  );
}
