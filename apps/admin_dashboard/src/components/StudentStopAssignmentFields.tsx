"use client";

import React from "react";
import SearchableSelect from "@/components/SearchableSelect";
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
  const placeholder = routeId ? "-- Select stage --" : "-- Assign route --";

  return (
    <div className="form-group form-span-full">
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
          <SearchableSelect
            id="student-same-stage"
            value={pickupStopId}
            options={routeStops}
            onChange={onSameStageChange}
            disabled={disabled}
            placeholder={placeholder}
            emptyLabel={routeId ? "No stages match" : "Assign a route first"}
            error={Boolean(pickupError)}
          />
          {pickupError && (
            <span className="form-error-text">{pickupError}</span>
          )}
        </div>
      ) : (
        <div className="student-stop-pair">
          <div className="form-group">
            <label className="form-label" htmlFor="student-pickup-stage">
              Pickup location *
            </label>
            <SearchableSelect
              id="student-pickup-stage"
              value={pickupStopId}
              options={routeStops}
              onChange={onPickupChange}
              disabled={disabled}
              placeholder={routeId ? "-- Select pickup --" : "-- Assign route --"}
              emptyLabel={routeId ? "No stages match" : "Assign a route first"}
              error={Boolean(pickupError)}
            />
            {pickupError && (
              <span className="form-error-text">{pickupError}</span>
            )}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="student-dropoff-stage">
              Drop-off location *
            </label>
            <SearchableSelect
              id="student-dropoff-stage"
              value={dropoffStopId}
              options={routeStops}
              onChange={onDropoffChange}
              disabled={disabled}
              placeholder={routeId ? "-- Select drop-off --" : "-- Assign route --"}
              emptyLabel={routeId ? "No stages match" : "Assign a route first"}
              error={Boolean(dropoffError)}
            />
            {dropoffError && (
              <span className="form-error-text">{dropoffError}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
