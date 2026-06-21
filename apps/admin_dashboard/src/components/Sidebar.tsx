"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  User
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const [staffExpanded, setStaffExpanded] = useState(false);

  // Keep staff menu expanded if currently active on staff sub-routes
  useEffect(() => {
    if (pathname && pathname.startsWith("/staff")) {
      setStaffExpanded(true);
    }
  }, [pathname]);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">S</div>
        <span className="brand-title">Safaricom Track</span>
      </div>
      <nav style={{ flex: 1 }}>
        <ul className="sidebar-menu">
          {/* Command Console */}
          <li>
            <Link 
              href="/" 
              className={`menu-item ${pathname === "/" ? "active" : ""}`}
            >
              <Navigation size={18} />
              <span>Command Console</span>
            </Link>
          </li>

          {/* Manage Fleet */}
          <li>
            <Link 
              href="/fleet" 
              className={`menu-item ${pathname === "/fleet" ? "active" : ""}`}
            >
              <Bus size={18} />
              <span>Manage Fleet</span>
            </Link>
          </li>

          {/* Staff Collapsible Section */}
          <li>
            <div 
              onClick={() => setStaffExpanded(!staffExpanded)}
              className={`menu-item ${pathname.startsWith("/staff") ? "active" : ""}`}
              style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Users size={18} />
                <span>Staff Management</span>
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

          {/* Route Planning */}
          <li>
            <Link 
              href="/routes" 
              className={`menu-item ${pathname === "/routes" ? "active" : ""}`}
            >
              <Compass size={18} />
              <span>Route Planning</span>
            </Link>
          </li>

          {/* System Config */}
          <li>
            <Link 
              href="#" 
              className="menu-item"
            >
              <Settings size={18} />
              <span>System Config</span>
            </Link>
          </li>
        </ul>
      </nav>
      <div style={{ padding: "16px", borderTop: "1px solid var(--border-default)" }}>
        <a href="#" className="menu-item">
          <LogOut size={18} />
          <span>Sign Out</span>
        </a>
      </div>
    </aside>
  );
}
