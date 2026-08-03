"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  MapPin,
  Nfc,
  Bell,
  ClipboardList,
  Menu,
  Search,
  X,
} from "lucide-react";
import {
  filterCountries,
  findCountryByName,
  formatInternationalPhone,
  getDialCodeOptions,
  normalizeLocalPhone,
} from "@/lib/countries";

type FormState = {
  full_name: string;
  role: string;
  school_name: string;
  country: string;
  city: string;
  phone: string;
  email: string;
  fleet_size: string;
  preferred_time: string;
  notes: string;
  company_website: string;
};

const INITIAL: FormState = {
  full_name: "",
  role: "Transport Manager",
  school_name: "",
  country: "Kenya",
  city: "",
  phone: "",
  email: "",
  fleet_size: "1-5",
  preferred_time: "This week",
  notes: "",
  company_website: "",
};

const EXPERIENCE = [
  {
    icon: MapPin,
    title: "Live fleet map",
    description: "See every active bus on one admin console map with trip status.",
  },
  {
    icon: Nfc,
    title: "NFC boarding",
    description: "Walk through student check-in on the driver manifest.",
  },
  {
    icon: Bell,
    title: "Parent SMS & push",
    description: "Review proximity and boarding alert templates schools use daily.",
  },
  {
    icon: ClipboardList,
    title: "Driver checklist",
    description: "Follow a morning run from start trip to end-of-route safety sweep.",
  },
];

const DIAL_CODES = getDialCodeOptions();

export default function RequestDemoPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [dialCode, setDialCode] = useState("+254");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const countryPickerRef = useRef<HTMLDivElement>(null);
  const countrySearchRef = useRef<HTMLInputElement>(null);

  const filteredCountries = useMemo(() => filterCountries(countryQuery), [countryQuery]);

  useEffect(() => {
    if (!countryOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!countryPickerRef.current?.contains(event.target as Node)) {
        setCountryOpen(false);
        setCountryQuery("");
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCountryOpen(false);
        setCountryQuery("");
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [countryOpen]);

  useEffect(() => {
    if (countryOpen) {
      countrySearchRef.current?.focus();
    }
  }, [countryOpen]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function selectCountry(name: string) {
    const match = findCountryByName(name);
    updateField("country", name);
    if (match) {
      setDialCode(match.dialCode);
    }
    setCountryOpen(false);
    setCountryQuery("");
  }

  function onDialCodeChange(nextCode: string) {
    setDialCode(nextCode);
  }

  function onPhoneLocalChange(value: string) {
    setPhoneLocal(normalizeLocalPhone(value));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!findCountryByName(form.country)) {
      setError("Please select a country from the list.");
      return;
    }

    const local = normalizeLocalPhone(phoneLocal);
    if (local.length < 7 || local.length > 12) {
      setError("Enter a valid phone number (7–12 digits after the country code).");
      return;
    }

    const phone = formatInternationalPhone(dialCode, local);
    setSubmitting(true);
    try {
      const res = await fetch("/api/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, phone }),
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        setError(json.error || "Could not submit your request.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <Link href="/" className="landing-brand">
            <img
              src="/logo.png"
              alt="OnTheBus — Safe Journeys. Brighter Futures."
              className="landing-brand-logo"
              width={360}
              height={130}
            />
          </Link>

          <ul className="landing-menu-links">
            <li>
              <Link href="/#features">Features</Link>
            </li>
            <li>
              <Link href="/#how-it-works">How It Works</Link>
            </li>
            <li>
              <Link href="/request-demo" className="is-active">
                Request Demo
              </Link>
            </li>
          </ul>

          <div className="landing-nav-actions">
            <Link href="/login" className="lp-link-login">
              Login
            </Link>
            <Link href="/request-demo" className="lp-btn lp-btn-primary lp-btn-pill">
              Request Demo
            </Link>
            <button
              type="button"
              className="landing-nav-toggle"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        <div className={`landing-mobile-menu${menuOpen ? " open" : ""}`}>
          <Link href="/#features" onClick={() => setMenuOpen(false)}>
            Features
          </Link>
          <Link href="/#how-it-works" onClick={() => setMenuOpen(false)}>
            How It Works
          </Link>
          <Link href="/login" onClick={() => setMenuOpen(false)}>
            Login
          </Link>
        </div>
      </nav>

      <main>
        <section className="lp-demo-hero">
          <div className="landing-container lp-demo-grid">
            <div className="lp-demo-copy">
              <p className="lp-demo-eyebrow">Request a demo</p>
              <h1>See live fleet tracking, NFC boarding, and parent SMS in 20 minutes</h1>
              <p>
                Tell us about your school and we will review your request. Once approved, we will email
                you a private Demo School link.
              </p>

              <figure className="lp-demo-product-visual">
                <Image
                  src="/stitch/hero-phone.jpg"
                  alt="Parent tracking a school bus and viewing its estimated arrival time in the OnTheBus mobile app"
                  width={512}
                  height={288}
                  priority
                  sizes="(max-width: 959px) calc(100vw - 48px), 560px"
                />
                <figcaption>
                  <MapPin size={16} aria-hidden />
                  Parents follow the bus live and see when it will arrive.
                </figcaption>
              </figure>

              <ul className="lp-demo-experience">
                {EXPERIENCE.map((item) => (
                  <li key={item.title}>
                    <item.icon size={20} aria-hidden />
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.description}</span>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="lp-demo-trust">
                <CheckCircle2 size={16} aria-hidden />
                Trusted by schools across East Africa · No commitment required
              </div>
            </div>

            <div className="lp-demo-form-card">
              {submitted ? (
                <div className="lp-demo-success">
                  <CheckCircle2 size={40} className="lp-demo-success-icon" aria-hidden />
                  <h2>Request received</h2>
                  <p>
                    Thanks — we&apos;ve emailed you a confirmation. Our team will review your request
                    and send your demo school URL plus login details once approved. This usually takes
                    up to one business day.
                  </p>
                  <a
                    href="mailto:sales@onthebus.app?subject=OnTheBus%20Sales"
                    className="lp-btn lp-btn-primary lp-btn-lg"
                  >
                    Contact Sales
                  </a>
                  <Link href="/" className="lp-link-login">
                    Back to home
                  </Link>
                </div>
              ) : (
                <form className="lp-demo-form" onSubmit={onSubmit}>
                  <h2>Book your walkthrough</h2>
                  <p className="lp-demo-form-sub">We respond within one business day.</p>

                  <label>
                    Full name *
                    <input
                      className="lp-input"
                      value={form.full_name}
                      onChange={(e) => updateField("full_name", e.target.value)}
                      required
                      autoComplete="name"
                    />
                  </label>

                  <label>
                    Role *
                    <select
                      className="lp-input"
                      value={form.role}
                      onChange={(e) => updateField("role", e.target.value)}
                    >
                      <option>Transport Manager</option>
                      <option>School Admin</option>
                      <option>Principal</option>
                      <option>Other</option>
                    </select>
                  </label>

                  <label>
                    School name *
                    <input
                      className="lp-input"
                      value={form.school_name}
                      onChange={(e) => updateField("school_name", e.target.value)}
                      required
                    />
                  </label>

                  <div className="lp-field" ref={countryPickerRef}>
                    <span className="lp-field-label">Country *</span>
                    <button
                      type="button"
                      className="lp-input lp-country-trigger"
                      aria-haspopup="listbox"
                      aria-expanded={countryOpen}
                      onClick={() => {
                        setCountryOpen((open) => {
                          const next = !open;
                          if (next) setCountryQuery("");
                          return next;
                        });
                      }}
                    >
                      <span>{form.country || "Select a country"}</span>
                      <ChevronDown size={18} aria-hidden />
                    </button>

                    {countryOpen ? (
                      <div className="lp-country-dropdown" role="listbox" aria-label="Countries">
                        <div className="lp-country-search">
                          <Search size={16} aria-hidden />
                          <input
                            ref={countrySearchRef}
                            className="lp-country-search-input"
                            value={countryQuery}
                            onChange={(e) => setCountryQuery(e.target.value)}
                            placeholder="Search countries"
                            aria-label="Filter countries"
                            autoComplete="off"
                          />
                        </div>
                        <ul className="lp-country-list">
                          {filteredCountries.length === 0 ? (
                            <li className="lp-country-empty">No countries match “{countryQuery}”</li>
                          ) : (
                            filteredCountries.map((country) => (
                              <li key={country.name}>
                                <button
                                  type="button"
                                  className={`lp-country-option${
                                    form.country === country.name ? " is-selected" : ""
                                  }`}
                                  onClick={() => selectCountry(country.name)}
                                  role="option"
                                  aria-selected={form.country === country.name}
                                >
                                  <span>{country.name}</span>
                                  <span className="lp-country-dial">{country.dialCode}</span>
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    ) : null}
                    <input type="hidden" name="country" value={form.country} required readOnly />
                  </div>

                  <label>
                    City / area *
                    <input
                      className="lp-input"
                      value={form.city}
                      onChange={(e) => updateField("city", e.target.value)}
                      required
                      placeholder="e.g. Nairobi, Westlands"
                    />
                  </label>

                  <div className="lp-field">
                    <span className="lp-field-label">WhatsApp or phone *</span>
                    <div className="lp-phone-row">
                      <select
                        className="lp-input lp-phone-code"
                        value={dialCode}
                        onChange={(e) => onDialCodeChange(e.target.value)}
                        aria-label="Country calling code"
                      >
                        {DIAL_CODES.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                      <input
                        className="lp-input lp-phone-local"
                        type="tel"
                        inputMode="numeric"
                        value={phoneLocal}
                        onChange={(e) => onPhoneLocalChange(e.target.value)}
                        required
                        autoComplete="tel-national"
                        placeholder="712 345 678"
                        aria-label="Phone number"
                      />
                    </div>
                    <span className="lp-field-hint">
                      Saved as {formatInternationalPhone(dialCode, phoneLocal || "…")}
                    </span>
                  </div>

                  <label>
                    Work email *
                    <input
                      className="lp-input"
                      type="email"
                      value={form.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </label>

                  <div className="lp-demo-form-row">
                    <label>
                      Approx. buses *
                      <select
                        className="lp-input"
                        value={form.fleet_size}
                        onChange={(e) => updateField("fleet_size", e.target.value)}
                      >
                        <option value="1-5">1–5</option>
                        <option value="6-15">6–15</option>
                        <option value="16+">16+</option>
                      </select>
                    </label>
                    <label>
                      Preferred time *
                      <select
                        className="lp-input"
                        value={form.preferred_time}
                        onChange={(e) => updateField("preferred_time", e.target.value)}
                      >
                        <option value="ASAP">ASAP</option>
                        <option value="This week">This week</option>
                        <option value="Next week">Next week</option>
                      </select>
                    </label>
                  </div>

                  <label>
                    Notes
                    <textarea
                      className="lp-input lp-textarea"
                      value={form.notes}
                      onChange={(e) => updateField("notes", e.target.value)}
                      rows={3}
                      placeholder="Anything we should know before the call?"
                    />
                  </label>

                  {/* Honeypot */}
                  <label className="lp-honeypot" aria-hidden="true">
                    Company website
                    <input
                      tabIndex={-1}
                      autoComplete="off"
                      value={form.company_website}
                      onChange={(e) => updateField("company_website", e.target.value)}
                    />
                  </label>

                  {error ? <p className="lp-demo-error">{error}</p> : null}

                  <button
                    type="submit"
                    className="lp-btn lp-btn-primary lp-btn-lg"
                    disabled={submitting}
                  >
                    {submitting ? "Sending…" : "Request Demo"}
                    {!submitting ? <ArrowRight size={18} /> : null}
                  </button>

                  <p className="lp-demo-fineprint">
                    Prefer email?{" "}
                    <a href="mailto:sales@onthebus.app?subject=OnTheBus%20Sales">Contact sales</a>
                  </p>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
