"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Mail } from "lucide-react";
import MarketingShell from "@/components/MarketingShell";

type FormState = {
  full_name: string;
  email: string;
  subject: string;
  message: string;
  company_website: string;
};

const INITIAL: FormState = {
  full_name: "",
  email: "",
  subject: "",
  message: "",
  company_website: "",
};

export default function ContactPage() {
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
        body: JSON.stringify({ kind: "contact", ...form }),
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
    <MarketingShell active="contact">
      <section className="co-hero co-hero-compact">
        <div className="landing-container co-hero-inner">
          <p className="co-eyebrow">Contact</p>
          <h1>We&apos;d love to hear from you</h1>
          <p className="co-lede">
            Questions about OnTheBus, partnerships, or support — send a note and our team will get
            back to you.
          </p>
        </div>
        <div className="co-hero-glow" aria-hidden />
      </section>

      <section className="lp-section">
        <div className="landing-container co-form-layout">
          <div className="co-form-intro">
            <h2>Get in touch</h2>
            <p>
              Fill in the form and we&apos;ll reply by email. For school demos, you can also{" "}
              <Link href="/request-demo">request a demo</Link> directly.
            </p>
            <ul className="co-contact-channels">
              <li>
                <span className="co-channel-icon" aria-hidden>
                  <Mail size={18} />
                </span>
                <div>
                  <strong>Email</strong>
                  <a href="mailto:info@onthebus.app">info@onthebus.app</a>
                </div>
              </li>
            </ul>
          </div>

          <div className="lp-demo-form-card co-form-card">
            {submitted ? (
              <div className="lp-demo-success">
                <CheckCircle2 size={40} className="lp-demo-success-icon" aria-hidden />
                <h2>Message sent</h2>
                <p>Thanks — we&apos;ve received your note and will reply as soon as we can.</p>
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
                  Subject
                  <input
                    required
                    className="lp-input"
                    name="subject"
                    value={form.subject}
                    onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  />
                </label>
                <label>
                  Message
                  <textarea
                    required
                    className="lp-input lp-textarea"
                    name="message"
                    rows={6}
                    placeholder="How can we help?"
                    value={form.message}
                    onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  />
                </label>

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
                  {submitting ? "Sending…" : "Send message"}
                </button>
                <p className="lp-demo-fineprint">
                  Or email{" "}
                  <a href="mailto:info@onthebus.app?subject=Contact%20OnTheBus">info@onthebus.app</a>
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
