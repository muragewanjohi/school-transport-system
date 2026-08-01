"use client";

import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Banknote,
  UserRound,
  CircleAlert,
  CircleCheck,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";

interface SchoolFormProps {
  mode: "add" | "edit";
  schoolId?: string;
}

type SlugStatus = "idle" | "checking" | "available" | "taken" | "reserved" | "invalid";

/** Turn a school name into a subdomain slug, e.g. "Acme Academy" → "acme-academy" */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

const emptyForm = {
  name: "",
  domain: "",
  contact_email: "",
  contact_phone: "",
  campus_name: "",
  campus_latitude: "-1.2921",
  campus_longitude: "36.8219",
  campus_monthly_fee_kes: "10000",
  admin_name: "",
  admin_email: "",
  admin_phone: "",
  status: "active" as "active" | "suspended",
};

export default function SchoolForm({ mode, schoolId }: Readonly<SchoolFormProps>) {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [formValues, setFormValues] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingSchool, setLoadingSchool] = useState(mode === "edit");
  const [submitError, setSubmitError] = useState<string | null>(null);
  // In edit mode the slug already exists, so name changes must not overwrite it
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(mode === "edit");
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [originalSlug, setOriginalSlug] = useState<string | null>(null);

  const isPlatformAdmin = profile?.role === "super_admin";

  useEffect(() => {
    if (authLoading) return;
    if (!isPlatformAdmin) {
      router.replace("/login?reason=use-school-subdomain");
    }
  }, [authLoading, isPlatformAdmin, router]);

  // Add mode: prefill fee with the platform default
  useEffect(() => {
    if (!isPlatformAdmin || mode !== "add") return;
    (async () => {
      try {
        const res = await fetch("/api/platform/settings");
        const json = await res.json();
        const fee = json.data?.default_campus_monthly_fee_kes;
        if (json.success && fee !== undefined) {
          setFormValues((p) => ({ ...p, campus_monthly_fee_kes: String(fee) }));
        }
      } catch {
        // keep the fallback default
      }
    })();
  }, [isPlatformAdmin, mode]);

  // Edit mode: load the school
  useEffect(() => {
    if (!isPlatformAdmin || mode !== "edit" || !schoolId) return;
    (async () => {
      setLoadingSchool(true);
      try {
        const res = await fetch(`/api/tenants/${schoolId}`);
        const json = await res.json();
        if (!json.success) {
          setSubmitError(json.error || "School not found");
          return;
        }
        const school = json.data;
        setFormValues({
          name: school.name ?? "",
          domain: school.domain ?? "",
          contact_email: school.contact_email || "",
          contact_phone: school.contact_phone || "",
          campus_name: school.campus?.name || "",
          campus_latitude: String(school.campus?.latitude ?? -1.2921),
          campus_longitude: String(school.campus?.longitude ?? 36.8219),
          campus_monthly_fee_kes: String(school.campus_monthly_fee_kes ?? 10000),
          admin_name: "",
          admin_email: "",
          admin_phone: "",
          status: (school.status as "active" | "suspended") ?? "active",
        });
        setOriginalSlug(school.domain ?? "");
      } catch {
        setSubmitError("Failed to load school details");
      } finally {
        setLoadingSchool(false);
      }
    })();
  }, [isPlatformAdmin, mode, schoolId]);

  // Debounced live availability check for the subdomain slug
  useEffect(() => {
    if (!isPlatformAdmin) return;
    const slug = formValues.domain.trim();

    if (!slug) {
      setSlugStatus("idle");
      return;
    }
    // Unchanged slug in edit mode is always fine
    if (mode === "edit" && originalSlug !== null && slug === originalSlug) {
      setSlugStatus("idle");
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 2) {
      setSlugStatus("invalid");
      return;
    }

    setSlugStatus("checking");
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ slug });
        if (mode === "edit" && schoolId) params.set("exclude_id", schoolId);
        const res = await fetch(`/api/tenants/check-slug?${params}`, { signal: controller.signal });
        const json = await res.json();
        if (!json.success) {
          setSlugStatus("idle");
          return;
        }
        if (json.data.reason === "reserved") {
          setSlugStatus("reserved");
        } else if (json.data.reason === "invalid") {
          setSlugStatus("invalid");
        } else {
          setSlugStatus(json.data.available ? "available" : "taken");
        }
      } catch {
        if (!controller.signal.aborted) setSlugStatus("idle");
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [formValues.domain, isPlatformAdmin, mode, originalSlug, schoolId]);

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!formValues.name.trim()) errors.name = "School name is required";
    if (!formValues.domain.trim()) {
      errors.domain = "Domain slug is required";
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(formValues.domain.trim())) {
      errors.domain = "Use lowercase slug like acme-academy";
    } else if (slugStatus === "taken") {
      errors.domain = "This subdomain is already registered to another school";
    } else if (slugStatus === "reserved") {
      errors.domain = "This subdomain is reserved by the platform";
    }
    const fee = Number(formValues.campus_monthly_fee_kes);
    if (!Number.isFinite(fee) || fee < 0) {
      errors.campus_monthly_fee_kes = "Enter a valid fee in KES";
    }
    if (mode === "add") {
      if (!formValues.admin_name.trim()) errors.admin_name = "Admin name is required";
      if (!formValues.admin_email.trim()) {
        errors.admin_email = "Invite email is required";
      } else if (!/\S+@\S+\.\S+/.test(formValues.admin_email)) {
        errors.admin_email = "Enter a valid email";
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;
    setIsSubmitting(true);

    try {
      if (mode === "add") {
        const res = await fetch("/api/tenants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formValues.name.trim(),
            domain: formValues.domain.trim(),
            contact_email: formValues.contact_email.trim(),
            contact_phone: formValues.contact_phone.trim(),
            campus_name: formValues.campus_name.trim() || undefined,
            campus_latitude: Number(formValues.campus_latitude),
            campus_longitude: Number(formValues.campus_longitude),
            campus_monthly_fee_kes: Number(formValues.campus_monthly_fee_kes),
            admin_name: formValues.admin_name.trim(),
            admin_email: formValues.admin_email.trim(),
            admin_phone: formValues.admin_phone.trim() || undefined,
          }),
        });
        const json = await res.json();
        if (!json.success) {
          setSubmitError(json.error || "Failed to create school");
          return;
        }
        if (json.warning) {
          alert(json.warning);
        }
      } else if (schoolId) {
        const res = await fetch(`/api/tenants/${schoolId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formValues.name.trim(),
            domain: formValues.domain.trim(),
            status: formValues.status,
            contact_email: formValues.contact_email.trim(),
            contact_phone: formValues.contact_phone.trim(),
            campus_name: formValues.campus_name.trim() || undefined,
            campus_latitude: Number(formValues.campus_latitude),
            campus_longitude: Number(formValues.campus_longitude),
            campus_monthly_fee_kes: Number(formValues.campus_monthly_fee_kes),
          }),
        });
        const json = await res.json();
        if (!json.success) {
          setSubmitError(json.error || "Failed to update school");
          return;
        }
      }

      router.push("/schools");
    } catch {
      setSubmitError("Unexpected error while saving school.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || !isPlatformAdmin) {
    return (
      <div className="app-container">
        <Sidebar />
        <main className="main-content" style={{ padding: 32 }}>
          <p style={{ color: "var(--text-muted)" }}>Checking platform access...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <header className="top-header school-form-header">
          <div className="school-form-heading">
            <Link href="/schools" className="back-link" aria-label="Back to Schools">
              <ArrowLeft size={17} />
            </Link>
            <div>
              <h1>{mode === "add" ? "Onboard School" : "Manage School"}</h1>
              <p>
                {mode === "add"
                  ? "Create the organization, its first campus and invite the school admin."
                  : "Update the organization, campus and platform fee."}
              </p>
            </div>
          </div>
          <UserProfileBadge />
        </header>

        <div className="school-form-body">
          {loadingSchool ? (
            <p style={{ color: "var(--text-muted)" }}>Loading school details...</p>
          ) : (
            <form onSubmit={handleSubmit} className="school-form">
              {submitError && (
                <div className="form-banner error">
                  <CircleAlert size={16} />
                  <span>{submitError}</span>
                </div>
              )}

              <section className="form-card">
                <div className="form-card-title">
                  <Building2 size={15} />
                  Organization
                </div>
                <div className="form-grid">
                  <div className="form-field">
                    <label className="form-label">School name *</label>
                    <input
                      className={`form-input ${formErrors.name ? "error" : ""}`}
                      value={formValues.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setFormValues((p) => ({
                          ...p,
                          name,
                          // Keep the slug in sync until the user edits it themselves
                          ...(slugManuallyEdited ? {} : { domain: slugify(name) }),
                        }));
                      }}
                    />
                    {formErrors.name && <span className="form-error-text">{formErrors.name}</span>}
                  </div>
                  <div className="form-field">
                    <label className="form-label">Subdomain slug *</label>
                    <input
                      className={`form-input ${formErrors.domain || slugStatus === "taken" || slugStatus === "reserved" ? "error" : ""} ${slugStatus === "available" ? "success" : ""}`}
                      placeholder="acme-academy"
                      value={formValues.domain}
                      onChange={(e) => {
                        setSlugManuallyEdited(true);
                        setFormValues((p) => ({ ...p, domain: e.target.value.toLowerCase() }));
                      }}
                    />
                    {slugStatus === "checking" && (
                      <span className="slug-status checking">
                        <Loader2 size={13} className="spin" /> Checking availability...
                      </span>
                    )}
                    {slugStatus === "available" && (
                      <span className="slug-status available">
                        <CircleCheck size={13} /> {formValues.domain}.onthebusapp.com is available
                      </span>
                    )}
                    {slugStatus === "taken" && (
                      <span className="slug-status taken">
                        <CircleAlert size={13} /> {formValues.domain}.onthebusapp.com is already taken
                      </span>
                    )}
                    {slugStatus === "reserved" && (
                      <span className="slug-status taken">
                        <CircleAlert size={13} /> This subdomain is reserved by the platform
                      </span>
                    )}
                    {slugStatus === "invalid" && formValues.domain.length > 0 && (
                      <span className="slug-status taken">
                        <CircleAlert size={13} /> Use a lowercase slug like acme-academy
                      </span>
                    )}
                    {formErrors.domain && slugStatus !== "taken" && slugStatus !== "reserved" && slugStatus !== "invalid" && (
                      <span className="form-error-text">{formErrors.domain}</span>
                    )}
                  </div>
                  <div className="form-field">
                    <label className="form-label">Contact email</label>
                    <input
                      className="form-input"
                      value={formValues.contact_email}
                      onChange={(e) => setFormValues((p) => ({ ...p, contact_email: e.target.value }))}
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Contact phone</label>
                    <input
                      className="form-input"
                      value={formValues.contact_phone}
                      onChange={(e) => setFormValues((p) => ({ ...p, contact_phone: e.target.value }))}
                    />
                  </div>
                </div>
                <p className="form-hint">
                  School console: <code>https://{formValues.domain || "acme-academy"}.onthebusapp.com</code>
                </p>
              </section>

              <section className="form-card">
                <div className="form-card-title">
                  <MapPin size={15} />
                  Campus
                </div>
                <div className="form-grid">
                  <div className="form-field span-2">
                    <label className="form-label">Campus name</label>
                    <input
                      className="form-input"
                      placeholder="Defaults to school name + Campus"
                      value={formValues.campus_name}
                      onChange={(e) => setFormValues((p) => ({ ...p, campus_name: e.target.value }))}
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Latitude</label>
                    <input
                      className="form-input mono"
                      value={formValues.campus_latitude}
                      onChange={(e) => setFormValues((p) => ({ ...p, campus_latitude: e.target.value }))}
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Longitude</label>
                    <input
                      className="form-input mono"
                      value={formValues.campus_longitude}
                      onChange={(e) => setFormValues((p) => ({ ...p, campus_longitude: e.target.value }))}
                    />
                  </div>
                </div>
              </section>

              <section className="form-card">
                <div className="form-card-title">
                  <Banknote size={15} />
                  Billing
                </div>
                <div className="form-grid">
                  <div className="form-field">
                    <label className="form-label">Campus monthly fee (KES) *</label>
                    <input
                      className={`form-input mono ${formErrors.campus_monthly_fee_kes ? "error" : ""}`}
                      inputMode="numeric"
                      value={formValues.campus_monthly_fee_kes}
                      onChange={(e) => setFormValues((p) => ({ ...p, campus_monthly_fee_kes: e.target.value }))}
                    />
                    {formErrors.campus_monthly_fee_kes && (
                      <span className="form-error-text">{formErrors.campus_monthly_fee_kes}</span>
                    )}
                  </div>
                  {mode === "edit" && (
                    <div className="form-field">
                      <label className="form-label">Status</label>
                      <select
                        className="form-input"
                        value={formValues.status}
                        onChange={(e) =>
                          setFormValues((p) => ({ ...p, status: e.target.value as "active" | "suspended" }))
                        }
                      >
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </div>
                  )}
                </div>
                <p className="form-hint">Platform fee = active campuses × this rate. Editable by platform only.</p>
              </section>

              {mode === "add" && (
                <section className="form-card">
                  <div className="form-card-title">
                    <UserRound size={15} />
                    First school admin (email invite)
                  </div>
                  <div className="form-grid">
                    <div className="form-field">
                      <label className="form-label">Admin name *</label>
                      <input
                        className={`form-input ${formErrors.admin_name ? "error" : ""}`}
                        value={formValues.admin_name}
                        onChange={(e) => setFormValues((p) => ({ ...p, admin_name: e.target.value }))}
                      />
                      {formErrors.admin_name && <span className="form-error-text">{formErrors.admin_name}</span>}
                    </div>
                    <div className="form-field">
                      <label className="form-label">Invite email *</label>
                      <input
                        className={`form-input ${formErrors.admin_email ? "error" : ""}`}
                        value={formValues.admin_email}
                        onChange={(e) => setFormValues((p) => ({ ...p, admin_email: e.target.value }))}
                      />
                      {formErrors.admin_email && <span className="form-error-text">{formErrors.admin_email}</span>}
                    </div>
                    <div className="form-field">
                      <label className="form-label">Admin phone</label>
                      <input
                        className="form-input"
                        value={formValues.admin_phone}
                        onChange={(e) => setFormValues((p) => ({ ...p, admin_phone: e.target.value }))}
                      />
                    </div>
                  </div>
                </section>
              )}

              <div className="form-actions">
                <Link href="/schools" className="btn-ghost">
                  Cancel
                </Link>
                <button type="submit" className="btn-primary" disabled={isSubmitting || slugStatus === "checking"}>
                  {isSubmitting ? "Saving..." : mode === "add" ? "Create & send invite" : "Save changes"}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>

      <style>{`
        .school-form-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
        }
        .school-form-heading {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .school-form-heading h1 { margin: 0; font-size: 1.25rem; }
        .school-form-heading p { margin: 4px 0 0; color: var(--text-muted); font-size: 0.85rem; }
        .back-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          border: 1px solid var(--border-default);
          color: var(--text-primary);
          background: var(--bg-surface);
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .back-link:hover { background: var(--bg-surface-hover); border-color: var(--text-muted); }

        .school-form-body {
          padding: 24px;
          display: flex;
          justify-content: center;
        }
        .school-form {
          width: min(860px, 100%);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .form-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          border-radius: 10px;
          padding: 12px 16px;
          font-size: 0.88rem;
        }
        .form-banner.error {
          background: rgba(244, 63, 94, 0.1);
          border: 1px solid rgba(244, 63, 94, 0.4);
          color: var(--state-error);
        }

        .form-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .form-card-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.78rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--accent-primary);
        }
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .form-field { display: flex; flex-direction: column; gap: 6px; }
        .form-field.span-2 { grid-column: span 2; }
        @media (max-width: 640px) {
          .form-grid { grid-template-columns: 1fr; }
          .form-field.span-2 { grid-column: span 1; }
        }
        .form-label { font-size: 0.78rem; color: var(--text-muted); }
        .form-input {
          width: 100%;
          background: var(--bg-base);
          border: 1px solid var(--border-default);
          color: var(--text-primary);
          border-radius: 8px;
          padding: 10px 12px;
          font-family: inherit;
          font-size: 0.9rem;
          transition: border-color 0.15s ease;
        }
        .form-input:focus { outline: none; border-color: var(--accent-primary); }
        .form-input.error { border-color: var(--state-error); }
        .form-input.success { border-color: rgba(16, 185, 129, 0.6); }
        .form-error-text { color: var(--state-error); font-size: 0.75rem; }
        .slug-status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.76rem;
        }
        .slug-status.checking { color: var(--text-muted); }
        .slug-status.available { color: var(--state-success); }
        .slug-status.taken { color: var(--state-error); }
        .spin { animation: spin 0.9s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .form-hint { margin: 0; font-size: 0.78rem; color: var(--text-muted); }
        .form-hint code { font-family: var(--font-mono, monospace); color: var(--accent-primary); }
        .mono { font-family: var(--font-mono, monospace); font-size: 0.84rem; }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding-bottom: 24px;
        }
        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: var(--accent-primary);
          color: #04110a;
          border: none;
          border-radius: 10px;
          padding: 10px 18px;
          font-weight: 600;
          font-size: 0.88rem;
          font-family: inherit;
          cursor: pointer;
          transition: filter 0.15s ease;
        }
        .btn-primary:hover { filter: brightness(1.08); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-ghost {
          display: inline-flex;
          align-items: center;
          background: transparent;
          border: 1px solid var(--border-default);
          color: var(--text-primary);
          border-radius: 10px;
          padding: 10px 18px;
          font-size: 0.88rem;
          font-family: inherit;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .btn-ghost:hover { background: var(--bg-surface-hover); }
      `}</style>
    </div>
  );
}
