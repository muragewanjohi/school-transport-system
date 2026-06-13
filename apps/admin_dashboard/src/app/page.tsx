"use client";

import React, { useState } from "react";
import { 
  Bus, 
  ShieldAlert, 
  Navigation, 
  UserCheck, 
  Compass, 
  Rss, 
  LogOut, 
  Settings, 
  AlertCircle, 
  MapPin, 
  Plus, 
  Play, 
  Sparkles 
} from "lucide-react";

interface TelemetryEvent {
  id: string;
  time: string;
  route: string;
  type: "info" | "success" | "error";
  message: string;
}

export default function Home() {
  // Simulator State
  const [busesActive, setBusesActive] = useState(4);
  const [boardedCount, setBoardedCount] = useState(142);
  const [alertCount, setAlertCount] = useState(48);
  const [sosCount, setSosCount] = useState(0);
  const [radarOffset, setRadarOffset] = useState({ x: 0, y: 0 });
  const [impersonating, setImpersonating] = useState(false);

  const [events, setEvents] = useState<TelemetryEvent[]>([
    {
      id: "1",
      time: "07:28:12 AM",
      route: "Morning Route 2",
      type: "success",
      message: "SMS Alert Dispatched via Africa's Talking -> +254 703 *** 122"
    },
    {
      id: "2",
      time: "07:28:10 AM",
      route: "Morning Route 2",
      type: "info",
      message: "Bus entered pickup geofence (Elsa's Home)"
    },
    {
      id: "3",
      time: "07:26:01 AM",
      route: "Morning Route 4",
      type: "success",
      message: "Student (James Omondi) Boarded via NFC Card Tap"
    },
    {
      id: "4",
      time: "07:24:14 AM",
      route: "Morning Route 4",
      type: "success",
      message: "SMS Alert Dispatched via Africa's Talking -> +254 712 *** 789"
    },
    {
      id: "5",
      time: "07:24:12 AM",
      route: "Morning Route 4",
      type: "info",
      message: "Bus entered pickup geofence (James's Home)"
    }
  ]);

  // Simulation Trigger Handlers
  const handleSimulateGPS = () => {
    // Generate random offsets for the radar bus animation node
    const randomX = Math.floor(Math.random() * 80) - 40;
    const randomY = Math.floor(Math.random() * 80) - 40;
    setRadarOffset({ x: randomX, y: randomY });

    const newTime = new Date().toLocaleTimeString("en-US", { hour12: true });
    const routes = ["Morning Route 1", "Morning Route 2", "Morning Route 4", "Morning Route 5"];
    const chosenRoute = routes[Math.floor(Math.random() * routes.length)];
    
    // Add entry
    const newEvent: TelemetryEvent = {
      id: Date.now().toString(),
      time: newTime,
      route: chosenRoute,
      type: "info",
      message: `Telemetry ping: Lat ${(-1.2921 + (Math.random() * 0.01)).toFixed(5)}, Lng ${(36.8219 + (Math.random() * 0.01)).toFixed(5)}`
    };

    setEvents(prev => [newEvent, ...prev.slice(0, 15)]);
    setAlertCount(prev => prev + 1);
  };

  const handleSimulateNFC = () => {
    const newTime = new Date().toLocaleTimeString("en-US", { hour12: true });
    const students = ["Fatuma Ali", "Brian Koech", "Mary Mwangi", "James Omondi"];
    const chosenStudent = students[Math.floor(Math.random() * students.length)];
    
    // Check if we hit limits
    if (boardedCount < 150) {
      setBoardedCount(prev => prev + 1);
    }

    const newEvent: TelemetryEvent = {
      id: Date.now().toString(),
      time: newTime,
      route: "Morning Route 4",
      type: "success",
      message: `Student (${chosenStudent}) Checked-In successfully via NFC tap`
    };

    setEvents(prev => [newEvent, ...prev.slice(0, 15)]);
  };

  const handleTriggerSOS = () => {
    const newTime = new Date().toLocaleTimeString("en-US", { hour12: true });
    setSosCount(prev => prev + 1);

    const newEvent: TelemetryEvent = {
      id: Date.now().toString(),
      time: newTime,
      route: "Morning Route 2",
      type: "error",
      message: "CRITICAL: Driver triggered SOS Alert coordinates streamed!"
    };

    setEvents(prev => [newEvent, ...prev.slice(0, 15)]);
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">S</div>
          <span className="brand-title">Safaricom Track</span>
        </div>
        <nav style={{ flex: 1 }}>
          <ul className="sidebar-menu">
            <li>
              <a href="#" className="menu-item active">
                <Navigation size={18} />
                <span>Command Console</span>
              </a>
            </li>
            <li>
              <a href="#" className="menu-item">
                <Bus size={18} />
                <span>Manage Fleet</span>
              </a>
            </li>
            <li>
              <a href="#" className="menu-item">
                <UserCheck size={18} />
                <span>Student Roster</span>
              </a>
            </li>
            <li>
              <a href="#" className="menu-item">
                <Compass size={18} />
                <span>Route Planning</span>
              </a>
            </li>
            <li>
              <a href="#" className="menu-item">
                <Settings size={18} />
                <span>System Config</span>
              </a>
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

      {/* Main Panel Content */}
      <main className="main-content">
        {/* Top Header Section */}
        <header className="top-bar">
          <div>
            <span className="top-bar-title">St. Mary's Academy Command Center</span>
            {impersonating && (
              <span style={{ 
                marginLeft: "12px", 
                background: "rgba(244,63,94,0.1)", 
                color: "var(--state-error)", 
                padding: "3px 8px", 
                borderRadius: "4px", 
                fontSize: "0.75rem",
                fontWeight: 600,
                border: "1px solid rgba(244,63,94,0.2)"
              }}>
                Impersonation Mode (Read-Only)
              </span>
            )}
          </div>
          <div className="user-profile">
            <button 
              onClick={() => setImpersonating(prev => !prev)}
              style={{
                background: "rgba(99,102,241,0.1)",
                color: "var(--accent-secondary)",
                border: "1px solid rgba(99,102,241,0.2)",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "0.8rem",
                cursor: "pointer",
                marginRight: "16px"
              }}
            >
              Toggle Support Mode
            </button>
            <div className="user-profile">
              <div className="profile-avatar">SA</div>
              <div>
                <span className="profile-name">
                  {impersonating ? "Platform Support Team" : "Sarah Jenkins"}
                </span>
                <span className="profile-role">
                  {impersonating ? "Super Administrator" : "School Admin"}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Metric Counter Panels */}
        <section className="dashboard-grid">
          <div className="stat-card primary">
            <div className="stat-label">Buses Active</div>
            <div className="stat-value">{busesActive} / 5</div>
            <div className="stat-desc">Morning trips in progress</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Students Checked-in</div>
            <div className="stat-value">{boardedCount} / 150</div>
            <div className="stat-desc">Boarded via NFC badge taps</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Proximity Alerts Sent</div>
            <div className="stat-value">{alertCount}</div>
            <div className="stat-desc">SMS dispatches via Africa's Talking</div>
          </div>
          <div className="stat-card error">
            <div className="stat-label">Emergency Panic SOS</div>
            <div className="stat-value">{sosCount}</div>
            <div className="stat-desc" style={{ color: sosCount > 0 ? "var(--state-error)" : "var(--text-muted)" }}>
              {sosCount > 0 ? "Urgent coordinates received" : "All routes normal & secure"}
            </div>
          </div>
        </section>

        {/* Dashboard split viewport */}
        <section className="dashboard-content-layout">
          {/* Map Viewport & Controls */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">
                <Compass size={18} style={{ color: "var(--accent-primary)" }} />
                Live Fleet telemetry (Nairobi Sector)
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button 
                  onClick={handleSimulateGPS}
                  style={{
                    background: "rgba(16,185,129,0.1)",
                    color: "var(--accent-primary)",
                    border: "1px solid rgba(16,185,129,0.2)",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  <Play size={12} />
                  Simulate GPS Ping
                </button>
                <button 
                  onClick={handleSimulateNFC}
                  style={{
                    background: "rgba(99,102,241,0.1)",
                    color: "var(--accent-secondary)",
                    border: "1px solid rgba(99,102,241,0.2)",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  <Plus size={12} />
                  Simulate NFC Tap
                </button>
                <button 
                  onClick={handleTriggerSOS}
                  style={{
                    background: "rgba(244,63,94,0.1)",
                    color: "var(--state-error)",
                    border: "1px solid rgba(244,63,94,0.2)",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  <AlertCircle size={12} />
                  Trigger SOS
                </button>
              </div>
            </div>

            {/* Simulated Map */}
            <div className="map-placeholder">
              <div className="map-grid-overlay"></div>
              <div className="map-radar-glow"></div>
              
              {/* Active Bus Node 1 */}
              <div className="map-bus-node" style={{ 
                position: "absolute",
                top: `calc(50% + ${radarOffset.y}px)`, 
                left: `calc(40% + ${radarOffset.x}px)`,
                transition: "all 1s cubic-bezier(0.25, 0.8, 0.25, 1)"
              }}>
                <div className="bus-dot" style={{ background: "var(--accent-primary)", boxShadow: "0 0 16px var(--accent-primary)" }}></div>
                <div className="bus-label">Bus 4 (Morning Run)</div>
              </div>

              {/* Parked Bus Node 2 */}
              <div className="map-bus-node" style={{ position: "absolute", top: "25%", left: "70%" }}>
                <div className="bus-dot" style={{ background: "var(--text-muted)", boxShadow: "none" }}></div>
                <div className="bus-label">Bus 1 (Parked)</div>
              </div>

              {/* Parked Bus Node 3 */}
              <div className="map-bus-node" style={{ position: "absolute", top: "75%", left: "20%" }}>
                <div className="bus-dot" style={{ background: "var(--accent-secondary)", boxShadow: "0 0 10px var(--accent-secondary)" }}></div>
                <div className="bus-label">Bus 2 (Morning Run)</div>
              </div>

              {/* SOS Indicator (only shows when SOS triggered) */}
              {sosCount > 0 && (
                <div className="map-bus-node" style={{ position: "absolute", top: "60%", left: "60%" }}>
                  <div className="bus-dot" style={{ 
                    background: "var(--state-error)", 
                    boxShadow: "0 0 20px var(--state-error)",
                    animation: "radar-pulse 1s infinite linear"
                  }}></div>
                  <div className="bus-label" style={{ border: "1px solid var(--state-error)", color: "var(--state-error)" }}>
                    Bus 5 - EMERGENCY SOS
                  </div>
                </div>
              )}
            </div>
            
            <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", fontSize: "0.8rem" }}>
              <Sparkles size={14} style={{ color: "var(--accent-secondary)" }} />
              <span>Click the simulation buttons above to trigger live coordinate streams and check-in manifest entries.</span>
            </div>
          </div>

          {/* Live Telemetry Log Feed Panel */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">
                <Rss size={18} style={{ color: "var(--accent-secondary)" }} />
                Real-Time Telemetry Feed
              </span>
            </div>

            <div className="telemetry-list">
              {events.map(event => (
                <div className="telemetry-item" key={event.id}>
                  <div className="telemetry-meta">
                    <span className="telemetry-title">{event.message}</span>
                    <span className="telemetry-subtitle">
                      {event.time} • {event.route}
                    </span>
                  </div>
                  <span className={`telemetry-badge ${event.type}`}>
                    {event.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
