import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bell, MapPin, Nfc, ShieldCheck } from "lucide-react";
import MarketingShell from "@/components/MarketingShell";

export const metadata: Metadata = {
  title: "About OnTheBus",
  description:
    "OnTheBus helps private schools run safer student transport with live tracking, NFC boarding, and parent alerts across East Africa.",
};

const FEATURES = [
  {
    eyebrow: "Live fleet",
    title: "Know where every bus is — right now",
    body: "School admins watch active routes on one console map. Drivers stream GPS from the phone they already carry, so schools launch without vehicle telematics hardware.",
    image: "/stitch/about/feature-live-tracking.png",
    alt: "Parent checking a smartphone beside a yellow school bus on a tree-lined road",
    icon: MapPin,
  },
  {
    eyebrow: "NFC boarding",
    title: "Attendance that taps itself in",
    body: "Students check in with encrypted NFC badges. The driver manifest updates instantly, and parents get a boarding confirmation — no manual clipboard guessing.",
    image: "/stitch/about/feature-nfc-boarding.png",
    alt: "Student in school uniform tapping an ID card on a driver's phone at the bus door",
    icon: Nfc,
  },
  {
    eyebrow: "Parent peace of mind",
    title: "Alerts when it matters most",
    body: "Proximity and boarding messages reach parents by push and SMS, even when mobile data is spotty. Families know when to head outside — and that their child is on board.",
    image: "/stitch/about/feature-parent-alerts.png",
    alt: "Parent smiling while checking a phone as a school bus approaches down the street",
    icon: Bell,
  },
] as const;

export default function AboutPage() {
  return (
    <MarketingShell active="about">
      <section className="co-hero">
        <div className="landing-container co-hero-inner">
          <p className="co-eyebrow">About OnTheBus</p>
          <h1>Safer school journeys for every child on the route</h1>
          <p className="co-lede">
            We build the bridge between school transport desks, drivers on the road, and parents at
            home — live tracking, tap-to-board attendance, and reliable alerts across East Africa.
          </p>
          <div className="co-hero-actions">
            <Link href="/request-demo" className="lp-btn lp-btn-primary lp-btn-pill lp-btn-lg">
              Request a demo
              <ArrowRight size={18} aria-hidden />
            </Link>
            <Link href="/contact" className="lp-btn lp-btn-outline-green lp-btn-pill lp-btn-lg">
              Talk to us
            </Link>
          </div>
        </div>
        <div className="co-hero-glow" aria-hidden />
      </section>

      <section className="lp-section co-mission">
        <div className="landing-container co-mission-grid">
          <div>
            <p className="co-eyebrow">Our mission</p>
            <h2>Replace daily transit anxiety with clear, timely signal</h2>
          </div>
          <p>
            Private schools move thousands of students every morning and afternoon. When a bus is
            late, a badge is forgotten, or a parent is unsure, everyone feels it. OnTheBus turns that
            chaos into a shared, trustworthy picture — for the school that runs the fleet, the driver
            on the seat, and the family waiting at the gate.
          </p>
        </div>
      </section>

      <section className="lp-section co-features" aria-label="What we build">
        <div className="landing-container">
          <div className="lp-section-header">
            <h2>Built for the whole school journey</h2>
            <p>Product moments that matter from depot open to the last drop-off.</p>
          </div>

          <div className="co-feature-list">
            {FEATURES.map((feature, index) => (
              <article
                key={feature.title}
                className={`co-feature${index % 2 === 1 ? " is-reversed" : ""}`}
              >
                <div className="co-feature-copy">
                  <span className="co-feature-icon" aria-hidden>
                    <feature.icon size={22} />
                  </span>
                  <p className="co-eyebrow">{feature.eyebrow}</p>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </div>
                <figure className="co-feature-media">
                  <Image
                    src={feature.image}
                    alt={feature.alt}
                    width={960}
                    height={540}
                    sizes="(max-width: 899px) calc(100vw - 48px), 48vw"
                    priority={index === 0}
                  />
                </figure>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-section-soft co-values">
        <div className="landing-container">
          <div className="lp-section-header">
            <h2>How we work with schools</h2>
            <p>Practical principles behind every route we help run.</p>
          </div>
          <ul className="co-value-grid">
            <li>
              <ShieldCheck size={22} aria-hidden />
              <strong>Student safety first</strong>
              <span>
                NFC badges store encrypted IDs only — never names or phone numbers on the card.
              </span>
            </li>
            <li>
              <MapPin size={22} aria-hidden />
              <strong>Zero-hardware launch</strong>
              <span>
                Drivers use their smartphones. Schools go live in days, not months of wiring vans.
              </span>
            </li>
            <li>
              <Bell size={22} aria-hidden />
              <strong>Alerts that arrive</strong>
              <span>
                Push plus SMS fallback so parents still hear from you when data is unreliable.
              </span>
            </li>
          </ul>
        </div>
      </section>

      <section className="co-cta">
        <div className="landing-container co-cta-inner">
          <h2>Ready to see it with your routes?</h2>
          <p>Walk through live fleet tracking, NFC boarding, and parent alerts with our team.</p>
          <div className="co-hero-actions">
            <Link href="/request-demo" className="lp-btn lp-btn-white lp-btn-pill lp-btn-lg">
              Request Demo
            </Link>
            <Link href="/careers" className="lp-btn lp-btn-outline-white lp-btn-pill lp-btn-lg">
              Join the team
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
