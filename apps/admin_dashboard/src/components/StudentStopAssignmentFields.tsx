"use client";

import React from "react";
import type { StudentStopMode } from "@/lib/studentStopAssignment";

interface StopOption {
  id: string;
  name: string;
  route_id: string;
}

interface StudentStopAssignmentFieldsProps {
  routeId: string;
  stops: StopOption[];
  mode: StudentStopMode;
  pickupStopId: string;
  dropoffStopId: string;
  pickupError?: string;
  dropoffError?: string;
  onModeChange: (mode: StudentStopMode) => void;
  onSameStageChange: (stopId: string) => void;
  onPickupChange: (stopId: string) => void;
  onDropoffChange: (stopId: string) => void;
}

export default function StudentStopAssignmentFields({
  routeId,
  stops,
  mode,
  pickupStopId,
  dropoffStopId,
  pickupError,
  dropoffError,
  onModeChange,
  onSameStageChange,
  onPickupChange,
  onDropoffChange,
}: Readonly<StudentStopAssignmentFieldsProps>) {
  const routeStops = stops.filter((s) => s.route_id === routeId);
  const disabled = !routeId;

  return (
    <div className="form-group">
      <span className="form-label">Pickup and drop-off *</span>
      <div
        role="radiogroup"
        aria-label="Pickup and drop-off stages"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: "0.85rem",
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          <input
            type="radio"
            name="student-stop-mode"
            checked={mode === "same"}
            onChange={() => onModeChange("same")}
          />
          Pickup same as drop-off
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: "0.85rem",
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          <input
            type="radio"
            name="student-stop-mode"
            checked={mode === "different"}
            onChange={() => onModeChange("different")}
          />
          Pickup different from drop-off
        </label>
      </div>

      {mode === "same" ? (
        <div className="form-group">
          <label className="form-label" htmlFor="student-same-stage">
            Stage *
          </label>
          <select
            id="student-same-stage"
            className="form-input"
            value={pickupStopId}
            onChange={(e) => onSameStageChange(e.target.value)}
            disabled={disabled}
          >
            {!routeId && <option value="">-- Assign route --</option>}
            {routeId && <option value="">-- Select stage --</option>}
            {routeStops.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.name}
              </option>
            ))}
          </select>
          {pickupError && (
            <span className="form-error-text">{pickupError}</span>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="student-pickup-stage">
              Pickup location *
            </label>
            <select
              id="student-pickup-stage"
              className="form-input"
              value={pickupStopId}
              onChange={(e) => onPickupChange(e.target.value)}
              disabled={disabled}
            >
              {!routeId && <option value="">-- Assign route --</option>}
              {routeId && <option value="">-- Select pickup --</option>}
              {routeStops.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.name}
                </option>
              ))}
            </select>
            {pickupError && (
              <span className="form-error-text">{pickupError}</span>
            )}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="student-dropoff-stage">
              Drop-off location *
            </label>
            <select
              id="student-dropoff-stage"
              className="form-input"
              value={dropoffStopId}
              onChange={(e) => onDropoffChange(e.target.value)}
              disabled={disabled}
            >
              {!routeId && <option value="">-- Assign route --</option>}
              {routeId && <option value="">-- Select drop-off --</option>}
              {routeStops.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.name}
                </option>
              ))}
            </select>
            {dropoffError && (
              <span className="form-error-text">{dropoffError}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
