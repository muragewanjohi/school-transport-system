"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  User, 
  Plus, 
  Trash2, 
  Edit, 
  X, 
  Phone, 
  Mail, 
  Sparkles,
  UserCheck,
  CreditCard,
  Upload,
  FileSpreadsheet,
  Users,
  Search
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";
import { assignmentForNewRoute } from "@/lib/studentStopAssignment";
import {
  mergeStudentTripIds,
  studentMatchesRegistrySearch,
  studentMatchesRouteFilter,
  studentMatchesTripFilter,
} from "@/lib/studentRegistryFilter";

const PREDEFINED_LOCATIONS = [
  { id: "loc-1", name: "Kileleshwa stop (Githunguri Road)", coordinates: [36.7889, -1.2789] },
  { id: "loc-2", name: "Westlands stop (Mwanzi Road)", coordinates: [36.8085, -1.2645] },
  { id: "loc-3", name: "Kilimani stop (Chania Avenue)", coordinates: [36.7915, -1.2941] },
  { id: "loc-4", name: "Lavington stop (James Gichuru)", coordinates: [36.7725, -1.2852] },
  { id: "loc-5", name: "Langata stop (Kenyatta Market)", coordinates: [36.8045, -1.3142] },
  { id: "loc-6", name: "South C stop (Mugoya Estate)", coordinates: [36.8295, -1.3211] },
  { id: "loc-7", name: "Karen stop (Hardy Shopping Center)", coordinates: [36.7495, -1.3392] },
  { id: "loc-8", name: "CBD stop (GPO Bus Stop)", coordinates: [36.8192, -1.2845] },
];

interface DBRoute {
  id: string;
  name: string;
}

interface DBStop {
  id: string;
  name: string;
  route_id: string;
}

interface DBSchedule {
  id: string;
  name: string;
  route_id: string;
  departure_time?: string;
  direction?: "HOME_TO_SCHOOL" | "SCHOOL_TO_HOME";
}

interface Guardian {
  name: string;
  phone: string;
  email: string;
}

interface DBStudent {
  id: string;
  name: string;
  route_id: string;
  nfc_card_hash: string | null;
  status: "Present" | "Absent";
  pickup_stop_id: string | null;
  dropoff_stop_id: string | null;
  schedule_ids: string[];
  guardians: Guardian[];
  route?: {
    name: string;
  } | null;
  grade?: string | null;
  class_name?: string | null;
}

export default function StudentsManagement() {
  const router = useRouter();
  const [students, setStudents] = useState<DBStudent[]>([]);
  const [routes, setRoutes] = useState<DBRoute[]>([]);
  const [stops, setStops] = useState<DBStop[]>([]);
  const [schedules, setSchedules] = useState<DBSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState("All");
  const [routeFilter, setRouteFilter] = useState("All");
  const [tripFilter, setTripFilter] = useState("All");
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);

  // Modal State
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"add" | "edit">("add");
  const [currentEditId, setCurrentEditId] = useState<string | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  
  // Form State
  const [formValues, setFormValues] = useState({
    name: "",
    route_id: "",
    nfc_card_hash: "",
    pickup_stop_id: "",
    dropoff_stop_id: "",
    schedule_ids: [] as string[],
    status: "Present" as "Present" | "Absent",
    grade: "",
    class_name: "",
  });
  const [formGuardians, setFormGuardians] = useState<Guardian[]>([
    { name: "", phone: "", email: "" }
  ]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const fetchStudents = async () => {
    try {
      const res = await fetch("/api/students");
      const json = await res.json();
      if (json.success) {
        setStudents(json.data);
      }
    } catch (err) {
      console.error("Failed to load students:", err);
    }
  };

  const fetchStops = async () => {
    try {
      const res = await fetch("/api/stops");
      const json = await res.json();
      if (json.success) {
        setStops(json.data);
      }
    } catch (err) {
      console.error("Failed to load stops:", err);
    }
  };

  const fetchSchedules = async () => {
    try {
      const res = await fetch("/api/schedules");
      const json = await res.json();
      if (json.success) {
        setSchedules(json.data);
      }
    } catch (err) {
      console.error("Failed to load schedules:", err);
    }
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const routesRes = await fetch("/api/routes");
      const routesJson = await routesRes.json();
      if (routesJson.success) {
        setRoutes(routesJson.data);
      }
      await Promise.all([fetchStops(), fetchSchedules(), fetchStudents()]);
    } catch (err) {
      console.error("Failed to load students page data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const handleToggleStatus = async (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const newStatus = student.status === "Present" ? "Absent" : "Present";
    try {
      const res = await fetch(`/api/students/${studentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      const json = await res.json();
      if (json.success) {
        await fetchStudents();
      }
    } catch (err) {
      console.error("Failed to sync student status toggle:", err);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  const handleRouteIdChange = (routeId: string) => {
    const routeStops = stops.filter(s => s.route_id === routeId);
    const firstStopId = routeStops[0]?.id || "";
    const secondStopId = routeStops[1]?.id || firstStopId || "";

    setFormValues(prev => ({
      ...prev,
      route_id: routeId,
      pickup_stop_id: firstStopId,
      dropoff_stop_id: secondStopId,
      schedule_ids: []
    }));

    if (formErrors.route_id) {
      setFormErrors(prev => ({ ...prev, route_id: "" }));
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formValues.name.trim()) errors.name = "Student name is required";
    if (!formValues.route_id) errors.route_id = "Please assign a transit route";
    if (!formValues.pickup_stop_id) errors.pickup_stop_id = "Please select a pickup stop";
    if (!formValues.dropoff_stop_id) errors.dropoff_stop_id = "Please select a drop-off stop";
    if (formValues.nfc_card_hash && formValues.nfc_card_hash.trim().length < 4) {
      errors.nfc_card_hash = "NFC Card Hash must be at least 4 characters";
    }

    // Validate guardians
    const guardianErrors: string[] = [];
    formGuardians.forEach((g, idx) => {
      if (!g.name.trim()) {
        guardianErrors.push(`Guardian ${idx + 1} name is required`);
        return;
      }
      const phoneTrimmed = g.phone.trim();
      if (!phoneTrimmed) {
        guardianErrors.push(`Guardian ${idx + 1} phone number is required`);
        return;
      }
      const codes = ["+254", "+256", "+255", "+250", "+1", "+44"];
      let matchedCode = "";
      for (const code of codes) {
        if (phoneTrimmed.startsWith(code)) {
          matchedCode = code;
          break;
        }
      }
      const localPart = matchedCode ? phoneTrimmed.substring(matchedCode.length) : phoneTrimmed;
      if (!localPart) {
        guardianErrors.push(`Guardian ${idx + 1} phone number details are required`);
      } else if (!/^\d+$/.test(localPart)) {
        guardianErrors.push(`Guardian ${idx + 1} phone number must consist of digits only`);
      } else if (localPart.length < 7 || localPart.length > 11) {
        guardianErrors.push(`Guardian ${idx + 1} phone number is invalid (must be 7-11 digits)`);
      }
      const emailTrimmed = g.email.trim();
      if (!emailTrimmed) {
        guardianErrors.push(`Guardian ${idx + 1} email is required`);
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
        guardianErrors.push(`Guardian ${idx + 1} email is invalid`);
      }
    });

    if (guardianErrors.length > 0) {
      errors.guardians = guardianErrors[0];
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitLoading(true);

    const payload = {
      name: formValues.name,
      route_id: formValues.route_id,
      nfc_card_hash: formValues.nfc_card_hash || null,
      pickup_stop_id: formValues.pickup_stop_id || null,
      dropoff_stop_id: formValues.dropoff_stop_id || null,
      schedule_ids: formValues.schedule_ids,
      status: formValues.status,
      guardians: formGuardians.filter(
        (g) => g.name.trim() && g.phone.trim() && g.email.trim()
      ),
      grade: formValues.grade || null,
      class_name: formValues.class_name || null
    };

    try {
      if (drawerMode === "add") {
        const res = await fetch("/api/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.success) {
          await fetchStudents();
          setShowDrawer(false);
        } else {
          const errorMsg = json.error || (json.errors ? Object.entries(json.errors).map(([k, v]) => `${k}: ${v}`).join(", ") : "Unknown validation error");
          alert(`Failed to register student: ${errorMsg}`);
        }
      } else {
        const res = await fetch(`/api/students/${currentEditId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.success) {
          await fetchStudents();
          setShowDrawer(false);
          alert("Student profile updated.");
        } else {
          const errorMsg = json.error || (json.errors ? Object.entries(json.errors).map(([k, v]) => `${k}: ${v}`).join(", ") : "Unknown validation error");
          alert(`Failed to update student: ${errorMsg}`);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    if (!confirm("Are you sure you want to remove this student? This will permanently delete their NFC logs and geofence references.")) return;
    
    try {
      const res = await fetch(`/api/students/${id}`, {
        method: "DELETE"
      });
      const json = await res.json();
      if (json.success) {
        await fetchStudents();
        alert("Student profile removed.");
      }
    } catch (err) {
      console.error("Failed to delete student:", err);
    }
  };

  // Resolve stop ID to stop names
  const findStopNameById = (stopId: string | null | undefined) => {
    if (!stopId) return "Standby stop (Unassigned)";
    const stop = stops.find(s => s.id === stopId);
    return stop?.name || "Unknown Stop";
  };

  const persistStudentFields = async (
    studentId: string,
    fields: Record<string, string | string[] | null>
  ) => {
    setSavingStudentId(studentId);
    try {
      const res = await fetch(`/api/students/${studentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const json = await res.json();
      if (!json.success) {
        const errorMsg = json.error || "Unknown validation error";
        alert(`Failed to update student: ${errorMsg}`);
        return false;
      }
      await fetchStudents();
      return true;
    } catch (err) {
      console.error("Failed to update student assignment:", err);
      return false;
    } finally {
      setSavingStudentId(null);
    }
  };

  const handleInlineRouteChange = async (student: DBStudent, routeId: string) => {
    if (!routeId || routeId === student.route_id) return;
    const routeStops = stops.filter((s) => s.route_id === routeId);
    if (routeStops.length === 0) {
      alert("Add stops to this route before assigning students.");
      return;
    }
    const assignment = assignmentForNewRoute(
      student.pickup_stop_id,
      student.dropoff_stop_id,
      routeStops
    );
    await persistStudentFields(student.id, {
      route_id: routeId,
      pickup_stop_id: assignment.pickup_stop_id,
      dropoff_stop_id: assignment.dropoff_stop_id,
      schedule_ids: assignment.schedule_ids,
    });
  };

  const handleInlineTripChange = async (
    student: DBStudent,
    slot: "pickup" | "dropoff",
    selectedId: string
  ) => {
    const routeSchedules = schedules.filter((s) => s.route_id === student.route_id);
    const pickupScheduleIds = routeSchedules
      .filter((s) => s.direction === "HOME_TO_SCHOOL")
      .map((s) => s.id);
    const dropoffScheduleIds = routeSchedules
      .filter((s) => s.direction === "SCHOOL_TO_HOME")
      .map((s) => s.id);
    const schedule_ids = mergeStudentTripIds({
      currentIds: student.schedule_ids || [],
      pickupScheduleIds,
      dropoffScheduleIds,
      slot,
      selectedId,
    });
    await persistStudentFields(student.id, { schedule_ids });
  };

  const tripLabel = (schedule: DBSchedule) => {
    const kind = schedule.direction === "SCHOOL_TO_HOME" ? "Drop off" : "Pick up";
    const time = schedule.departure_time ? ` · ${schedule.departure_time.slice(0, 5)}` : "";
    return `${schedule.name} (${kind}${time})`;
  };

  // Client-side CSV Spreadsheet Importer
  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));
    
    const nameIdx = headers.indexOf("name");
    const routeIdx = headers.indexOf("route_name");
    const pickupIdx = headers.indexOf("pickup_stop");
    const dropoffIdx = headers.indexOf("dropoff_stop");
    const guardiansIdx = headers.indexOf("guardians");
    const nfcIdx = headers.indexOf("nfc_card_hash");
    const gradeIdx = headers.indexOf("grade");
    const classIdx = headers.indexOf("class_name") !== -1 ? headers.indexOf("class_name") : headers.indexOf("class");
    
    if (nameIdx === -1 || routeIdx === -1 || pickupIdx === -1 || dropoffIdx === -1 || guardiansIdx === -1) {
      alert("CSV spreadsheet is missing required column headers.\nRequired: name, route_name, pickup_stop, dropoff_stop, guardians");
      return [];
    }
    
    const parsedRows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const cells: string[] = [];
      let currentCell = "";
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          cells.push(currentCell.trim().replace(/^["']|["']$/g, ""));
          currentCell = "";
        } else {
          currentCell += char;
        }
      }
      cells.push(currentCell.trim().replace(/^["']|["']$/g, ""));
      
      if (cells.length <= Math.max(nameIdx, routeIdx, pickupIdx, dropoffIdx, guardiansIdx)) continue;
      
      const name = cells[nameIdx];
      const routeName = cells[routeIdx];
      const pickupStopText = cells[pickupIdx];
      const dropoffStopText = cells[dropoffIdx];
      const guardiansText = cells[guardiansIdx];
      const nfc = nfcIdx !== -1 ? cells[nfcIdx] : "";
      const grade = gradeIdx !== -1 ? cells[gradeIdx] : "";
      const className = classIdx !== -1 ? cells[classIdx] : "";
      
      parsedRows.push({
        name,
        routeName,
        pickupStopText,
        dropoffStopText,
        guardiansText,
        nfc_card_hash: nfc,
        grade,
        class_name: className
      });
    }
    return parsedRows;
  };

  const handleSpreadsheetImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) return;

      let successCount = 0;

      for (const row of rows) {
        // Resolve route mapping
        let route = routes.find(r => r.name.toLowerCase().includes(row.routeName.toLowerCase()));
        if (!route) {
          route = routes[0];
        }

        if (!route) continue;

        // Resolve pickup stop mapping
        let pickupStop = stops.find(s => 
          s.name.toLowerCase().includes(row.pickupStopText.toLowerCase())
        ) || stops.find(s => s.route_id === route.id) || stops[0] || null;

        // Resolve drop-off stop mapping
        let dropoffStop = stops.find(s => 
          s.name.toLowerCase().includes(row.dropoffStopText.toLowerCase())
        ) || stops.find(s => s.route_id === route.id) || stops[1] || null;

        // Parse guardians (Format: Name1:Phone1:Email1|Name2:Phone2:Email2)
        const parsedGuardians: Guardian[] = [];
        if (row.guardiansText) {
          const parts = row.guardiansText.split("|");
          for (const part of parts) {
            const splitInfo = part.split(":");
            if (splitInfo.length >= 3) {
              parsedGuardians.push({
                name: splitInfo[0].trim(),
                phone: splitInfo[1].trim(),
                email: splitInfo.slice(2).join(":").trim(),
              });
            } else if (splitInfo.length >= 2) {
              parsedGuardians.push({
                name: splitInfo[0].trim(),
                phone: splitInfo[1].trim(),
                email: "",
              });
            }
          }
        }

        if (parsedGuardians.length === 0) {
          parsedGuardians.push({
            name: "Unspecified Guardian",
            phone: "+254 700 000 000",
            email: "unspecified@example.com",
          });
        }

        const payload = {
          name: row.name,
          route_id: route.id,
          nfc_card_hash: row.nfc_card_hash || null,
          pickup_stop_id: pickupStop ? pickupStop.id : null,
          dropoff_stop_id: dropoffStop ? dropoffStop.id : null,
          schedule_ids: [],
          status: "Present",
          guardians: parsedGuardians,
          grade: row.grade || null,
          class_name: row.class_name || null
        };

        try {
          const res = await fetch("/api/students", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const json = await res.json();
          if (json.success) {
            successCount++;
          }
        } catch (err) {
          console.error("Failed to import student:", err);
        }
      }

      await fetchStudents();
      alert(`Import completed successfully! Bulk registered ${successCount} students with custom guardians and locations in database.`);
      if (e.target) e.target.value = "";
    };
    reader.readAsText(file);
  };

  // Metrics
  const totalStudentsCount = students.length;
  const activeNfcCount = students.filter(s => s.nfc_card_hash).length;
  const distinctRouteIds = new Set(students.map(s => s.route_id).filter(Boolean));
  const routeCoverageCount = distinctRouteIds.size;

  // Unique grades list for filtering
  const uniqueGrades = Array.from(new Set(students.map(s => s.grade).filter(Boolean))).sort() as string[];

  // Filtered Students List
  const filteredStudents = students.filter(student => {
    if (gradeFilter !== "All" && student.grade !== gradeFilter) return false;
    if (!studentMatchesRouteFilter(student.route_id, routeFilter)) return false;
    if (!studentMatchesTripFilter(student.schedule_ids, tripFilter)) return false;

    const pickupName = findStopNameById(student.pickup_stop_id);
    const dropoffName = findStopNameById(student.dropoff_stop_id);
    const tripNames = (student.schedule_ids || []).map(
      (id) => schedules.find((s) => s.id === id)?.name || id
    );

    return studentMatchesRegistrySearch({
      name: student.name,
      routeName: student.route?.name || "",
      pickupName,
      dropoffName,
      nfc: student.nfc_card_hash,
      grade: student.grade,
      className: student.class_name,
      tripNames,
      guardians: student.guardians || [],
      query: searchQuery,
    });
  });

  return (
    <div className="app-container">
      <Sidebar />

      <style jsx global>{`
        .btn-spinner {
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-top: 2px solid var(--accent-primary);
          border-radius: 50%;
          width: 14px;
          height: 14px;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .student-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          padding: 16px;
          position: relative;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 12px;
          color: var(--text-primary);
          box-shadow: var(--shadow-sm);
        }
        .student-card:hover {
          border-color: var(--accent-secondary);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }
        .student-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
        }
        .student-table th {
          text-align: left;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-default);
          color: var(--text-muted);
          font-weight: 600;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .student-table td {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-default);
          vertical-align: middle;
        }
        .student-table tr:hover {
          background: var(--row-hover);
        }
        .student-avatar {
          width: 44px;
          height: 44px;
          background: rgba(99, 102, 241, 0.1);
          color: var(--accent-secondary);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 1.1rem;
        }
        .drawer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(4, 6, 12, 0.85);
          backdrop-filter: blur(8px);
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .drawer-content {
          width: 620px;
          max-width: 90vw;
          height: auto;
          max-height: 85vh;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          padding: 24px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          animation: scale-up 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .form-group {
          margin-bottom: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-label {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .form-input {
          background: var(--input-bg);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          padding: 10px 12px;
          color: var(--text-primary);
          font-size: 0.9rem;
          outline: none;
        }
        .form-error-text {
          font-size: 0.75rem;
          color: var(--state-error);
        }
        .nfc-badge {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--state-success);
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .nfc-badge.unlinked {
          color: var(--text-muted);
        }
        .import-box {
          background: rgba(255, 255, 255, 0.02);
          border: 1px dashed var(--border-default);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: all 0.2s ease;
        }
        .import-box:hover {
          border-color: rgba(99, 102, 241, 0.3);
          background: rgba(255, 255, 255, 0.03);
        }
        .cols-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 4px;
        }
        .col-tag {
          font-size: 0.7rem;
          font-weight: 600;
          font-family: monospace;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 2px 6px;
          border-radius: 4px;
          color: var(--text-muted);
        }
        .col-tag.required {
          color: var(--accent-secondary);
          border-color: rgba(99, 102, 241, 0.2);
          background: rgba(99, 102, 241, 0.05);
        }
        .switch-container {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          user-select: none;
          margin-top: 4px;
        }
        .switch-track {
          width: 36px;
          height: 20px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid var(--border-default);
          position: relative;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .switch-track.Present {
          background: rgba(16, 185, 129, 0.2);
          border-color: rgba(16, 185, 129, 0.5);
          box-shadow: 0 0 8px rgba(16, 185, 129, 0.2);
        }
        .switch-track.Absent {
          background: rgba(244, 63, 94, 0.1);
          border-color: rgba(244, 63, 94, 0.4);
        }
        .switch-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #ffffff;
          position: absolute;
          top: 2px;
          left: 2px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        }
        .switch-track.Present .switch-thumb {
          transform: translateX(16px);
          background: var(--state-success);
        }
        .switch-track.Absent .switch-thumb {
          transform: translateX(0);
          background: var(--text-muted);
        }
        .switch-label {
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .switch-label.Present {
          color: var(--state-success);
        }
        .switch-label.Absent {
          color: var(--state-error);
        }
        @keyframes slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes scale-up {
          from { transform: scale(0.96); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spinner-icon {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.25);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
      `}</style>

      <main className="main-content">
        <header className="top-bar">
          <div>
            <span className="top-bar-title">Student Roster Directory</span>
            <span style={{ 
              marginLeft: "12px", 
              background: "rgba(99,102,241,0.1)", 
              color: "var(--accent-secondary)", 
              padding: "3px 8px", 
              borderRadius: "4px", 
              fontSize: "0.75rem",
              fontWeight: 600,
              border: "1px solid rgba(99,102,241,0.2)"
            }}>
              School Roster
            </span>
          </div>
          <UserProfileBadge />
        </header>

        {/* KPIs */}
        <section className="dashboard-grid">
          <div className="stat-card primary">
            <div className="stat-label">Total Students</div>
            <div className="stat-value">{totalStudentsCount}</div>
            <div className="stat-desc">Registered student profiles</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Smart Cards Linked</div>
            <div className="stat-value" style={{ color: "var(--state-success)" }}>
              {activeNfcCount} / {totalStudentsCount}
            </div>
            <div className="stat-desc">Students active on NFC tags</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Transit Routes Used</div>
            <div className="stat-value" style={{ color: "var(--accent-secondary)" }}>
              {routeCoverageCount}
            </div>
            <div className="stat-desc">Route coverage index</div>
          </div>
        </section>

        {/* Spreadsheet Importer */}
        <section className="import-box">
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <FileSpreadsheet size={24} style={{ color: "var(--accent-secondary)", marginTop: "2px" }} />
            <div>
              <h4 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>Bulk Spreadsheet importer</h4>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2px" }}>
                Onboard students by uploading a CSV spreadsheet. Required columns:
              </p>
              <div className="cols-list">
                <span className="col-tag required" title="Required Name">name *</span>
                <span className="col-tag required" title="Required Route name matching">route_name *</span>
                <span className="col-tag required" title="Required Pickup stop name">pickup_stop *</span>
                <span className="col-tag required" title="Required Drop-off stop name">dropoff_stop *</span>
                <span className="col-tag required" title="Format: Name:Phone:Email|Name2:Phone2:Email2 (Max 3)">guardians *</span>
                <span className="col-tag" title="Optional hash string">nfc_card_hash</span>
                <span className="col-tag" title="Optional Student Grade">grade</span>
                <span className="col-tag" title="Optional Student Class Name">class_name</span>
              </div>
            </div>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "rgba(0,0,0,0.15)", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border-default)" }}>
            <label 
              htmlFor="spreadsheet-file" 
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <Upload size={14} />
              Select CSV File
            </label>
            <input 
              id="spreadsheet-file"
              type="file"
              accept=".csv"
              onChange={handleSpreadsheetImport}
              style={{ display: "none" }}
            />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Supports .csv files exported from Excel</span>
          </div>
        </section>

        {/* Panel Listing */}
        <section className="dashboard-content-layout" style={{ gridTemplateColumns: "1fr" }}>
          <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
            <div className="panel-header" style={{ border: "none", margin: 0, paddingBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span className="panel-title" style={{ fontSize: "1.2rem", fontWeight: 600 }}>
                  <Users size={20} style={{ color: "var(--accent-primary)" }} />
                  Student Manifests Registry
                </span>
              </div>
              <button 
                onClick={() => {
                  router.push("/students/new");
                }}
                style={{
                  background: "linear-gradient(135deg, var(--accent-primary), #059669)",
                  color: "#ffffff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <Plus size={16} />
                Register New Student
              </button>
            </div>

            {/* Filter Search */}
            <div style={{
              display: "flex",
              gap: "12px",
              marginBottom: "16px",
              flexWrap: "wrap"
            }}>
              {/* Search Bar */}
              <div style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--border-default)",
                borderRadius: "8px",
                padding: "8px 14px",
                gap: "8px",
                flex: 2,
                minWidth: "240px"
              }}>
                <Search size={16} style={{ color: "var(--text-muted)" }} />
                <input
                  type="text"
                  placeholder="Search by student name, route, stops, guardians, or NFC card..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                    width: "100%"
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center"
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Grade Filter Dropdown */}
              <div style={{ flex: 1, minWidth: "150px" }}>
                <select
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value)}
                  style={{
                    background: "var(--input-bg)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "12px",
                    padding: "10px 12px",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                    outline: "none",
                    width: "100%",
                    cursor: "pointer"
                  }}
                >
                  <option value="All">All Grades</option>
                  {uniqueGrades.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              {/* Route Filter Dropdown */}
              <div style={{ flex: 1, minWidth: "160px" }}>
                <select
                  value={routeFilter}
                  onChange={(e) => {
                    const next = e.target.value;
                    setRouteFilter(next);
                    if (next !== "All" && tripFilter !== "All" && tripFilter !== "none") {
                      const selectedTrip = schedules.find((s) => s.id === tripFilter);
                      if (next === "none" || (selectedTrip && selectedTrip.route_id !== next)) {
                        setTripFilter("All");
                      }
                    }
                  }}
                  style={{
                    background: "var(--input-bg)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "12px",
                    padding: "10px 12px",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                    outline: "none",
                    width: "100%",
                    cursor: "pointer"
                  }}
                >
                  <option value="All">All routes</option>
                  <option value="none">No route assigned</option>
                  {routes.map((route) => (
                    <option key={route.id} value={route.id}>{route.name}</option>
                  ))}
                </select>
              </div>

              {/* Trip Filter Dropdown */}
              <div style={{ flex: 1, minWidth: "180px" }}>
                <select
                  value={tripFilter}
                  onChange={(e) => setTripFilter(e.target.value)}
                  style={{
                    background: "var(--input-bg)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "12px",
                    padding: "10px 12px",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                    outline: "none",
                    width: "100%",
                    cursor: "pointer"
                  }}
                >
                  <option value="All">All trips</option>
                  <option value="none">No trip assigned</option>
                  {(routeFilter !== "All" && routeFilter !== "none"
                    ? schedules.filter((schedule) => schedule.route_id === routeFilter)
                    : schedules
                  ).map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {tripLabel(schedule)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isLoading ? (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "200px", color: "var(--text-muted)" }}>
                <span>Loading student records...</span>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "200px", color: "var(--text-muted)", border: "1px dashed var(--border-default)", borderRadius: "12px" }}>
                <span>No student profiles match the current search, route, or trip filter.</span>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="student-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Attendance Status</th>
                      <th>Trips</th>
                      <th>Route</th>
                      <th>Parents & Guardians</th>
                      <th>Grade</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map(student => {
                      const initials = student.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
                      const routeSchedules = schedules.filter((s) => s.route_id === student.route_id);
                      const pickupSchedules = routeSchedules.filter((s) => s.direction === "HOME_TO_SCHOOL");
                      const dropoffSchedules = routeSchedules.filter((s) => s.direction === "SCHOOL_TO_HOME");
                      const selectedPickupId = (student.schedule_ids || []).find((id) => pickupSchedules.some((s) => s.id === id)) || "";
                      const selectedDropoffId = (student.schedule_ids || []).find((id) => dropoffSchedules.some((s) => s.id === id)) || "";
                      const isSaving = savingStudentId === student.id;

                      return (
                        <tr key={student.id}>
                          {/* Student Name */}
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              <div className="student-avatar">{initials}</div>
                              <div>
                                <span style={{ fontWeight: 600, color: "var(--text-primary)", display: "block" }}>{student.name}</span>
                                {student.class_name && (
                                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                                    {student.class_name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Status Toggle */}
                          <td>
                            <div className="switch-container" onClick={() => handleToggleStatus(student.id)}>
                              <div className={`switch-track ${student.status}`} title="Click to toggle status">
                                <div className="switch-thumb" />
                              </div>
                              <span className={`switch-label ${student.status}`} style={{ minWidth: "50px" }}>
                                {student.status}
                              </span>
                            </div>
                          </td>

                          {/* Trips */}
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "200px" }}>
                              <select
                                value={selectedPickupId}
                                disabled={isSaving || !student.route_id}
                                onChange={(e) => handleInlineTripChange(student, "pickup", e.target.value)}
                                style={{
                                  background: "var(--input-bg)",
                                  border: "1px solid var(--border-default)",
                                  borderRadius: "8px",
                                  padding: "6px 8px",
                                  color: "var(--text-primary)",
                                  fontSize: "0.75rem",
                                  outline: "none",
                                  width: "100%",
                                  cursor: isSaving ? "wait" : "pointer",
                                }}
                              >
                                <option value="">Pick up trip: none</option>
                                {pickupSchedules.map((schedule) => (
                                  <option key={schedule.id} value={schedule.id}>
                                    Pick up: {schedule.name}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={selectedDropoffId}
                                disabled={isSaving || !student.route_id}
                                onChange={(e) => handleInlineTripChange(student, "dropoff", e.target.value)}
                                style={{
                                  background: "var(--input-bg)",
                                  border: "1px solid var(--border-default)",
                                  borderRadius: "8px",
                                  padding: "6px 8px",
                                  color: "var(--text-primary)",
                                  fontSize: "0.75rem",
                                  outline: "none",
                                  width: "100%",
                                  cursor: isSaving ? "wait" : "pointer",
                                }}
                              >
                                <option value="">Drop off trip: none</option>
                                {dropoffSchedules.map((schedule) => (
                                  <option key={schedule.id} value={schedule.id}>
                                    Drop off: {schedule.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>

                          {/* Route */}
                          <td>
                            <select
                              value={student.route_id || ""}
                              disabled={isSaving}
                              onChange={(e) => handleInlineRouteChange(student, e.target.value)}
                              style={{
                                background: "var(--input-bg)",
                                border: "1px solid var(--border-default)",
                                borderRadius: "8px",
                                padding: "6px 8px",
                                color: "var(--text-primary)",
                                fontSize: "0.8rem",
                                outline: "none",
                                minWidth: "180px",
                                width: "100%",
                                cursor: isSaving ? "wait" : "pointer",
                              }}
                            >
                              <option value="">-- Select Route --</option>
                              {routes.map((route) => (
                                <option key={route.id} value={route.id}>{route.name}</option>
                              ))}
                            </select>
                          </td>

                          {/* Guardians */}
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              {student.guardians && student.guardians.map((g, idx) => (
                                <div key={idx} style={{ display: "flex", alignItems: "baseline", gap: "6px", fontSize: "0.8rem" }}>
                                  <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{g.name}</span>
                                  <a href={`tel:${g.phone}`} style={{ color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "2px", fontSize: "0.75rem" }}>
                                    <Phone size={8} /> {g.phone}
                                  </a>
                                </div>
                              ))}
                            </div>
                          </td>

                          {/* Grade */}
                          <td>
                            <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                              {student.grade || "Unassigned"}
                            </span>
                          </td>

                          {/* Actions */}
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                              <button
                                onClick={() => {
                                  setLoadingEditId(student.id);
                                  router.push(`/students/${student.id}/edit`);
                                }}
                                style={{ background: "rgba(255,255,255,0.03)", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", width: "26px", height: "26px" }}
                                title="Edit Profile"
                                disabled={loadingEditId !== null}
                              >
                                {loadingEditId === student.id ? (
                                  <div className="btn-spinner"></div>
                                ) : (
                                  <Edit size={14} />
                                )}
                              </button>
                              <button
                                onClick={() => handleDeleteStudent(student.id)}
                                style={{ background: "rgba(244,63,94,0.05)", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "var(--state-error)" }}
                                title="Remove Profile"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
