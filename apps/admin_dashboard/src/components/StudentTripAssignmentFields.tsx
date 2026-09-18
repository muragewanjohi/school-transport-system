"use client";

import React from "react";
import SearchableSelect from "@/components/SearchableSelect";
import { mergeStudentTripIds } from "@/lib/studentRegistryFilter";
import {
  selectedTripSelectValue,
  studentTripSelectOptions,
  tripIdFromSelectValue,
  type StudentTripSchedule,
} from "@/lib/studentTripSelect";

interface StudentTripAssignmentFieldsProps {
  routeId: string;
  schedules: StudentTripSchedule[];
  scheduleIds: string[];
  onChange: (scheduleIds: string[]) => void;
}

export default function StudentTripAssignmentFields({
  routeId,
  schedules,
  scheduleIds,
  onChange,
}: Readonly<StudentTripAssignmentFieldsProps>) {
  const routeSchedules = schedules.filter((s) => s.route_id === routeId);
  const pickupSchedules = routeSchedules.filter((s) => s.direction === "HOME_TO_SCHOOL");
  const dropoffSchedules = routeSchedules.filter((s) => s.direction === "SCHOOL_TO_HOME");
  const pickupIds = pickupSchedules.map((s) => s.id);
  const dropoffIds = dropoffSchedules.map((s) => s.id);
  const selectedPickupId = scheduleIds.find((id) => pickupIds.includes(id)) || "";
  const selectedDropoffId = scheduleIds.find((id) => dropoffIds.includes(id)) || "";
  const disabled = !routeId;

  function updateSlot(slot: "pickup" | "dropoff", selectedId: string) {
    onChange(
      mergeStudentTripIds({
        currentIds: scheduleIds,
        pickupScheduleIds: pickupIds,
        dropoffScheduleIds: dropoffIds,
        slot,
        selectedId,
      })
    );
  }

  return (
    <div className="form-grid">
      <div className="form-group">
        <label className="form-label" htmlFor="student-pickup-trip">
          Pick up trip
        </label>
        <SearchableSelect
          id="student-pickup-trip"
          value={disabled ? "" : selectedTripSelectValue(selectedPickupId)}
          options={disabled ? [] : studentTripSelectOptions(pickupSchedules, "None (No Pick up)")}
          onChange={(id) => updateSlot("pickup", tripIdFromSelectValue(id))}
          disabled={disabled}
          placeholder={routeId ? "-- Select pick up trip --" : "-- Assign route --"}
          searchPlaceholder="Search trips"
          searchAriaLabel="Filter pick up trips"
          emptyLabel={
            routeId
              ? pickupSchedules.length === 0
                ? "No pick-up trips configured"
                : "No trips match"
              : "Assign a route first"
          }
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="student-dropoff-trip">
          Drop off trip
        </label>
        <SearchableSelect
          id="student-dropoff-trip"
          value={disabled ? "" : selectedTripSelectValue(selectedDropoffId)}
          options={disabled ? [] : studentTripSelectOptions(dropoffSchedules, "None (No Drop off)")}
          onChange={(id) => updateSlot("dropoff", tripIdFromSelectValue(id))}
          disabled={disabled}
          placeholder={routeId ? "-- Select drop off trip --" : "-- Assign route --"}
          searchPlaceholder="Search trips"
          searchAriaLabel="Filter drop off trips"
          emptyLabel={
            routeId
              ? dropoffSchedules.length === 0
                ? "No drop-off trips configured"
                : "No trips match"
              : "Assign a route first"
          }
        />
      </div>
    </div>
  );
}
