"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Sparkles } from "lucide-react";
import MarketingShell from "@/components/MarketingShell";

const SPECIALIZATIONS = [
  "Engineering",
  "Product",
  "Design",
  "Sales",
  "Customer Success",
  "Operations",
  "Marketing",
  "Other",
] as const;

type FormState = {
  full_name: string;
  email: string;
  phone: string;
  specialization: string;
  details: string;
  company_website: string;
};

const INITIAL: FormState = {
  full_name: "",
  email: "",
  phone: "",
  specialization: "Engineering",
  details: "",
  company_website: "",
};

export default function CareersPage() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/public-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "careers", ...form }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error || "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
      setForm(INITIAL);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MarketingShell active="careers">
      <section className="co-hero co-hero-compact">
        <div className="landing-container co-hero-inner">
          <p className="co-eyebrow">Careers</p>
          <h1>We&apos;re hiring soon</h1>
          <p className="co-lede">
            Roles are not open yet — but we&apos;d love to hear from people who care about safer
            school transport. Share your specialization and we&apos;ll reach out when the right
            seat opens.
          </p>
          <div className="co-coming-soon" role="status">
            <Sparkles size={18} aria-hidden />
            <span>Coming soon — leave your interest below</span>
          </div>
        </div>
        <div className="co-hero-glow" aria-hidden />
      </section>

      <section className="lp-section">
        <div className="landing-container co-form-layout">
          <div className="co-form-intro">
            <h2>Tell us about you</h2>
            <p>
              Introduce yourself, pick a specialization, and share a little about what you&apos;ve
              built or want to build. Messages go to{" "}
              <a href="mailto:info@onthebus.app">info@onthebus.app</a>.
            </p>
            <ul className="co-form-bullets">
              <li>Engineering, product, design, and go-to-market</li>
              <li>East Africa–aware builders welcome</li>
              <li>No open roles listed yet — interest only</li>
            </ul>
          </div>

          <div className="lp-demo-form-card co-form-card">
            {submitted ? (
              <div className="lp-demo-success">
                <CheckCircle2 size={40} className="lp-demo-success-icon" aria-hidden />
                <h2>Thanks for reaching out</h2>
                <p>
                  We&apos;ve received your note. When careers open in your area, we&apos;ll be in
                  touch at the email you shared.
                </p>
                <button
                  type="button"
                  className="lp-btn lp-btn-outline-green lp-btn-pill"
                  onClick={() => setSubmitted(false)}
                >
                  Send another
                </button>
              </div>
            ) : (
              <form className="lp-demo-form" onSubmit={onSubmit} noValidate>
                <label>
                  Full name
                  <input
                    required
                    className="lp-input"
                    name="full_name"
                    autoComplete="name"
                    value={form.full_name}
                    onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  />
                </label>
                <label>
                  Email
                  <input
                    required
                    className="lp-input"
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </label>
                <label>
                  Phone <span className="co-optional">(optional)</span>
                  <input
                    className="lp-input"
                    type="tel"
                    name="phone"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </label>
                <label>
                  Specialization
                  <select
                    required
                    className="lp-input"
                    name="specialization"
                    value={form.specialization}
                    onChange={(e) => setForm((f) => ({ ...f, specialization: e.target.value }))}
                  >
                    {SPECIALIZATIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Details
                  <textarea
                    required
                    className="lp-input lp-textarea"
                    name="details"
                    rows={5}
                    placeholder="What you do best, recent work, and why OnTheBus interests you…"
                    value={form.details}
                    onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                  />
                </label>

                {/* Honeypot */}
                <input
                  className="lp-honeypot"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden
                  value={form.company_website}
                  onChange={(e) => setForm((f) => ({ ...f, company_website: e.target.value }))}
                />

                {error ? <p className="lp-demo-error">{error}</p> : null}

                <button
                  type="submit"
                  className="lp-btn lp-btn-primary lp-btn-pill"
                  disabled={submitting}
                >
                  {submitting ? "Sending…" : "Submit interest"}
                </button>
                <p className="lp-demo-fineprint">
                  Prefer email?{" "}
                  <a href="mailto:info@onthebus.app?subject=Careers%20interest">info@onthebus.app</a>
                  {" · "}
                  <Link href="/about">About OnTheBus</Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
