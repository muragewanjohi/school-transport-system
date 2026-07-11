"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
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
  Clock
} from "lucide-react";

export default function Sidebar() {
  return (
    <Suspense fallback={
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">S</div>
          <span className="brand-title">Safaricom Track</span>
        </div>
      </aside>
    }>
      <SidebarContent />
    </Suspense>
  );
}

function SidebarContent() {
  const { profile, signOut } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const [staffExpanded, setStaffExpanded] = useState(false);
  const [routesExpanded, setRoutesExpanded] = useState(false);

  // Automatically expand sections based on active pathname
  useEffect(() => {
    if (pathname.startsWith("/staff")) {
      setStaffExpanded(true);
    }
    if (pathname.startsWith("/routes")) {
      setRoutesExpanded(true);
    }
  }, [pathname]);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">S</div>
        <span className="brand-title">Safaricom Track</span>
      </div>

      <nav className="sidebar-menu">
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
          {/* Real-time Tracking */}
          <li>
            <Link 
              href="/" 
              className={`menu-item ${pathname === "/" ? "active" : ""}`}
            >
              <Navigation size={18} />
              <span>Real-time Tracking</span>
            </Link>
          </li>

          {/* Fleet Management */}
          <li>
            <Link 
              href="/fleet" 
              className={`menu-item ${pathname === "/fleet" ? "active" : ""}`}
            >
              <Bus size={18} />
              <span>Fleet Management</span>
            </Link>
          </li>

          {/* Staff Roster Collapsible Section */}
          <li>
            <div 
              onClick={() => setStaffExpanded(!staffExpanded)}
              className={`menu-item ${pathname.startsWith("/staff") ? "active" : ""}`}
              style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Users size={18} />
                <span>Staff Roster</span>
              </div>
              {staffExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>

            {staffExpanded && (
              <ul style={{ 
                listStyle: "none", 
                paddingLeft: "24px", 
                marginTop: "4px", 
                marginBottom: "4px", 
                display: "flex", 
                flexDirection: "column", 
                gap: "2px" 
              }}>
                <li>
                  <Link 
                    href="/staff/drivers" 
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

          {/* Student Roster */}
          <li>
            <Link 
              href="/students" 
              className={`menu-item ${pathname === "/students" ? "active" : ""}`}
            >
              <UserCheck size={18} />
              <span>Student Roster</span>
            </Link>
          </li>

          {/* Routes Collapsible Section */}
          <li>
            <div 
              onClick={() => setRoutesExpanded(!routesExpanded)}
              className={`menu-item ${pathname.startsWith("/routes") ? "active" : ""}`}
              style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Compass size={18} />
                <span>Routes</span>
              </div>
              {routesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>

            {routesExpanded && (
              <ul style={{ 
                listStyle: "none", 
                paddingLeft: "24px", 
                marginTop: "4px", 
                marginBottom: "4px", 
                display: "flex", 
                flexDirection: "column", 
                gap: "2px" 
              }}>
                <li>
                  <Link 
                    href="/routes" 
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
                    className={`menu-item ${pathname === "/routes/stops" ? "active" : ""}`}
                    style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                  >
                    <MapPin size={14} style={{ color: "var(--accent-primary)" }} />
                    <span>Stops & Stages</span>
                  </Link>
                </li>
                <li>
                  <Link 
                    href="/routes/today-trips" 
                    className={`menu-item ${pathname === "/routes/today-trips" ? "active" : ""}`}
                    style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                  >
                    <Clock size={14} style={{ color: "var(--accent-secondary)" }} />
                    <span>Today's Trips</span>
                  </Link>
                </li>
                <li>
                  <Link 
                    href="/routes?tab=schools" 
                    className={`menu-item ${pathname === "/routes" && tabParam === "schools" ? "active" : ""}`}
                    style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                  >
                    <MapPin size={14} style={{ color: "var(--text-muted)" }} />
                    <span>School Locations</span>
                  </Link>
                </li>
              </ul>
            )}
          </li>

          {/* Admin Management */}
          {profile?.admin_role === "Super Admin" && (
            <li>
              <Link 
                href="/users" 
                className={`menu-item ${pathname === "/users" ? "active" : ""}`}
              >
                <Shield size={18} />
                <span>Admin Management</span>
              </Link>
            </li>
          )}

          {/* Billing Console */}
          <li>
            <Link 
              href="/billing" 
              className={`menu-item ${pathname.startsWith("/billing") ? "active" : ""}`}
            >
              <CreditCard size={18} />
              <span>Billing & Plan</span>
            </Link>
          </li>

          {/* System Config */}
          <li>
            <Link 
              href="/config" 
              className={`menu-item ${pathname === "/config" ? "active" : ""}`}
            >
              <Settings size={18} />
              <span>System Config</span>
            </Link>
          </li>
        </ul>
      </nav>
      <div style={{ padding: "16px", borderTop: "1px solid var(--border-default)", display: "flex", flexDirection: "column", gap: "12px" }}>
        {profile && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "4px 8px" }}>
            <div style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              fontSize: "0.9rem",
              color: "white",
              flexShrink: 0
            }}>
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {profile.name}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {profile.admin_role || "Administrator"}
              </span>
            </div>
          </div>
        )}
        <a 
          href="#" 
          onClick={(e) => {
            e.preventDefault();
            signOut();
          }} 
          className="menu-item"
        >
          <LogOut size={18} />
          <span>Sign Out</span>
        </a>
      </div>
    </aside>
  );
}
