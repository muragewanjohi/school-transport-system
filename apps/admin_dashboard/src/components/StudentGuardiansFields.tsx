"use client";

import React, { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  addExistingParentToGuardians,
  DEFAULT_GUARDIAN_SOURCE_MODE,
  filterParentsByName,
  GUARDIAN_PHONE_CODES,
  MAX_GUARDIANS,
  parseParentOptions,
  shouldShowExistingParentDropdown,
  type GuardianEntry,
  type GuardianSourceMode,
  type ParentOption,
} from "@/lib/studentGuardians";

interface StudentGuardiansFieldsProps {
  guardians: GuardianEntry[];
  error?: string;
  onChange: (guardians: GuardianEntry[]) => void;
  onError: (message: string) => void;
}

function dialCodeForPhone(phone: string): string {
  for (const code of GUARDIAN_PHONE_CODES) {
    if (phone.startsWith(code)) return code;
  }
  return "+254";
}

function localPartForPhone(phone: string): string {
  for (const code of GUARDIAN_PHONE_CODES) {
    if (phone.startsWith(code)) return phone.substring(code.length);
  }
  return phone;
}

export default function StudentGuardiansFields({
  guardians,
  error,
  onChange,
  onError,
}: Readonly<StudentGuardiansFieldsProps>) {
  const [sourceMode, setSourceMode] = useState<GuardianSourceMode>(
    DEFAULT_GUARDIAN_SOURCE_MODE
  );
  const [existingParents, setExistingParents] = useState<ParentOption[]>([]);
  const [nameFilter, setNameFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/parents")
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: unknown }) => {
        if (cancelled || !json.success) return;
        setExistingParents(parseParentOptions(json.data));
      })
      .catch(() => {
        if (!cancelled) setExistingParents([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredParents = filterParentsByName(existingParents, nameFilter);
  const showDropdown = shouldShowExistingParentDropdown(sourceMode);

  const updateGuardian = (index: number, patch: Partial<GuardianEntry>) => {
    const next = guardians.map((guardian, i) =>
      i === index ? { ...guardian, ...patch } : guardian
    );
    onChange(next);
  };

  const handleSelectExistingParent = (parentId: string) => {
    if (!parentId) return;
    const parent = existingParents.find((row) => row.id === parentId);
    if (!parent) return;
    const result = addExistingParentToGuardians(guardians, parent);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onChange(result.guardians);
  };

  return (
    <div>
      <h3 className="form-section-title">Parents & Guardians</h3>

      <div
        role="radiogroup"
        aria-label="Parent source"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
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
            name="guardian-source-mode"
            checked={sourceMode === "existing"}
            onChange={() => setSourceMode("existing")}
          />
          Existing parent
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
            name="guardian-source-mode"
            checked={sourceMode === "new"}
            onChange={() => {
              setSourceMode("new");
              setNameFilter("");
            }}
          />
          Add new parent
        </label>
      </div>

      {showDropdown && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: "var(--bg-base)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
          }}
        >
          <label
            className="form-label"
            htmlFor="existing-parent-filter"
            style={{
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              marginBottom: 6,
              display: "block",
            }}
          >
            Quick search existing parent
          </label>
          <input
            id="existing-parent-filter"
            type="text"
            className="form-input"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Type a name to filter"
            aria-label="Filter existing parents by name"
            autoComplete="off"
            style={{ marginBottom: 8 }}
          />
          <select
            className="form-input"
            value=""
            onChange={(e) => handleSelectExistingParent(e.target.value)}
            aria-label="Choose registered parent to auto-fill"
          >
            <option value="">-- Choose registered parent to auto-fill --</option>
            {filteredParents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name} ({parent.phone}
                {parent.email ? ` · ${parent.email}` : ""})
              </option>
            ))}
          </select>
          {existingParents.length === 0 && (
            <span
              style={{
                display: "block",
                marginTop: 8,
                fontSize: "0.75rem",
                color: "var(--text-muted)",
              }}
            >
              No registered parents yet. Choose Add new parent to enter details.
            </span>
          )}
          {existingParents.length > 0 &&
            nameFilter.trim() &&
            filteredParents.length === 0 && (
              <span className="form-error-text" style={{ display: "block", marginTop: 8 }}>
                No parents match that name.
              </span>
            )}
        </div>
      )}

      {error && (
        <span
          className="form-error-text"
          style={{ marginBottom: 12, display: "block" }}
        >
          {error}
        </span>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {guardians.map((guardian, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              paddingBottom: guardians.length > 1 ? 8 : 0,
              borderBottom:
                guardians.length > 1 && index < guardians.length - 1
                  ? "1px solid var(--border-default)"
                  : undefined,
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ flex: 1, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ flex: "1 1 140px" }}
                  placeholder="Guardian Name"
                  value={guardian.name}
                  onChange={(e) => updateGuardian(index, { name: e.target.value })}
                  required
                />
                <div style={{ display: "flex", gap: 8, flex: "1 1 200px" }}>
                  <select
                    value={dialCodeForPhone(guardian.phone)}
                    onChange={(e) => {
                      const newCode = e.target.value;
                      let currentLocal = localPartForPhone(guardian.phone);
                      if (currentLocal.startsWith("0")) {
                        currentLocal = currentLocal.substring(1);
                      }
                      updateGuardian(index, { phone: newCode + currentLocal });
                    }}
                    className="form-input"
                    style={{ width: 95, paddingLeft: 8, paddingRight: 8 }}
                    aria-label={`Guardian ${index + 1} country code`}
                  >
                    <option value="+254">🇰🇪 +254</option>
                    <option value="+256">🇺🇬 +256</option>
                    <option value="+255">🇹🇿 +255</option>
                    <option value="+250">🇷🇼 +250</option>
                    <option value="+1">🇺🇸 +1</option>
                    <option value="+44">🇬🇧 +44</option>
                  </select>
                  <input
                    type="text"
                    className="form-input"
                    style={{ flex: 1 }}
                    placeholder="Phone Number"
                    value={localPartForPhone(guardian.phone)}
                    onChange={(e) => {
                      const currentCode = dialCodeForPhone(guardian.phone);
                      let val = e.target.value.replace(/[\s\-()]+/g, "");
                      if (val.startsWith("0")) val = val.substring(1);
                      updateGuardian(index, { phone: currentCode + val });
                    }}
                    required
                  />
                </div>
              </div>
              {guardians.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange(guardians.filter((_, i) => i !== index))}
                  style={{
                    background: "rgba(244,63,94,0.06)",
                    border: "1px solid rgba(244,63,94,0.2)",
                    color: "var(--state-error)",
                    padding: 10,
                    borderRadius: 6,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                  }}
                  title="Remove Guardian Row"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <input
              type="email"
              className="form-input"
              placeholder="Guardian email (required for login OTP fallback)"
              value={guardian.email}
              onChange={(e) => updateGuardian(index, { email: e.target.value })}
              required
              aria-label={`Guardian ${index + 1} email`}
            />
          </div>
        ))}

        {guardians.length < MAX_GUARDIANS && (
          <button
            type="button"
            onClick={() =>
              onChange([...guardians, { name: "", phone: "", email: "" }])
            }
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
              padding: "6px 12px",
              borderRadius: 6,
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
              alignSelf: "flex-start",
              marginTop: 4,
            }}
          >
            + Add Guardian Profile
          </button>
        )}
      </div>
    </div>
  );
}
