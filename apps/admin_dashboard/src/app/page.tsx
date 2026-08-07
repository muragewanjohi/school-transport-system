"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  MapPin,
  Users,
  Bell,
  Route,
  AlertTriangle,
  Building2,
  BarChart3,
  Smartphone,
  CheckCircle2,
  ArrowRight,
  Play,
  Menu,
  X,
  School,
  UserRound,
  HeartHandshake,
  Zap,
  Gauge,
  Navigation,
  Cloud,
  Quote,
  Verified,
} from "lucide-react";

type FeatureItem = {
  icon: typeof MapPin;
  title: string;
  description: string;
  danger?: boolean;
};

const FEATURES: FeatureItem[] = [
  {
    icon: MapPin,
    title: "Live Bus Tracking",
    description: "Real-time GPS tracking so parents and admins always know exactly where the bus is.",
  },
  {
    icon: Users,
    title: "Student Attendance",
    description: "Digital roll call and boarding confirmation ensures every child is accounted for.",
  },
  {
    icon: Bell,
    title: "Smart Notifications",
    description: "Instant alerts for delays, boarding, and safe arrival via SMS and Push.",
  },
  {
    icon: Route,
    title: "Route Management",
    description: "Optimize travel paths to save time, fuel, and improve student pick-up efficiency.",
  },
  {
    icon: AlertTriangle,
    title: "Emergency SOS",
    description: "One-tap critical alerts for drivers to contact emergency response teams instantly.",
    danger: true,
  },
  {
    icon: Building2,
    title: "Multi-School Ready",
    description: "Designed for large transport agencies managing fleets across multiple schools.",
  },
  {
    icon: BarChart3,
    title: "Analytics & Reports",
    description: "Actionable insights on fuel usage, trip timing, and driver performance.",
  },
  {
    icon: Smartphone,
    title: "Dedicated Apps",
    description: "Separate, high-performance apps tailored for parents and bus drivers.",
  },
];

const STEPS = [
  {
    title: "School Configures Routes",
    shortTitle: "Plan every route",
    description:
      "Transport teams map stops, assign vehicles, and build reliable schedules around each school day.",
    image: "/stitch/journey/journey-route-setup.png",
    imageAlt: "School transport administrator configuring routes on a map",
    icon: Route,
  },
  {
    title: "Driver Starts Trip",
    shortTitle: "A confident start",
    description:
      "The driver confirms the vehicle, route, and student manifest before beginning the journey.",
    image: "/stitch/journey/journey-driver-start-v2.png",
    imageAlt: "School bus driver in a green jacket starting a trip from a mounted phone",
    icon: Play,
  },
  {
    title: "Bus Location Streams Live",
    shortTitle: "Live from the road",
    description:
      "Secure GPS updates keep the school and authorized guardians aligned with the bus in real time.",
    image: "/stitch/journey/journey-live-location.png",
    imageAlt: "School bus broadcasting its live location along a city route",
    icon: Navigation,
  },
  {
    title: "Parents Receive Alerts",
    shortTitle: "Reassurance, right on time",
    description:
      "Guardians receive clear alerts for departures, approaching stops, boarding, and safe arrivals.",
    image: "/stitch/journey/journey-parent-alerts.png",
    imageAlt: "Parent receiving a school bus arrival alert on a phone",
    icon: Bell,
  },
  {
    title: "Students Board the Bus",
    shortTitle: "Every child accounted for",
    description:
      "Digital check-in gives drivers and conductors an accurate manifest without slowing boarding.",
    image: "/stitch/journey/journey-student-boarding-v2.png",
    imageAlt: "Students boarding a school bus while a conductor in green uniform checks attendance",
    icon: Users,
  },
  {
    title: "School Receives Attendance",
    shortTitle: "One live source of truth",
    description:
      "The school sees attendance and trip status update instantly, helping staff act on exceptions early.",
    image: "/stitch/journey/journey-attendance.png",
    imageAlt: "School administrator reviewing a live transport attendance dashboard",
    icon: BarChart3,
  },
  {
    title: "Trip Complete",
    shortTitle: "Closed out safely",
    description:
      "The journey ends with a verified arrival, a complete digital record, and everyone informed.",
    image: "/stitch/journey/journey-trip-complete-v2.png",
    imageAlt: "Drivers in green uniforms with school bus safely parked after completing its route",
    icon: CheckCircle2,
  },
] as const;

const TRUST = ["AKILI SCHOOLS", "PREMIER ACADEMY"] as const;

const TESTIMONIALS = [
  {
    quote:
      "OnTheBus has transformed the way we manage our transport. Parents are happier and our operations are more efficient.",
    name: "Mr. David Otieno",
    role: "Transport Manager",
    avatar: "/stitch/avatar-1.jpg",
  },
  {
    quote:
      "I can see my child's bus in real time and get alerts when they arrive. It gives me so much peace of mind every day.",
    name: "Mrs. Grace Njeri",
    role: "Parent",
    avatar: "/stitch/avatar-2.jpg",
  },
  {
    quote:
      "The driver app is simple and helps me stay on schedule and communicate with parents easily. It makes my job much smoother.",
    name: "John Kamau",
    role: "School Bus Driver",
    avatar: "/stitch/avatar-3.jpg",
  },
] as const;

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [stepsVisible, setStepsVisible] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const stepsRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = stepsRef.current;
    if (!node) return;
    const root = pageRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setStepsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStepsVisible(true);
          observer.disconnect();
        }
      },
      { root, threshold: 0.2 }
    );
    observer.observe(node);
    const fallback = window.setTimeout(() => setStepsVisible(true), 1200);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="landing-page" ref={pageRef}>
      <nav className="landing-nav" aria-label="Primary">
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
            <li><a href="#features" className="is-active">Features</a></li>
            <li><a href="#solutions">Solutions</a></li>
            <li><a href="#how-it-works">How It Works</a></li>
            <li><a href="#contact">Pricing</a></li>
            <li><a href="#contact">Resources</a></li>
          </ul>

          <div className="landing-nav-actions">
            <Link href="/request-demo" className="lp-btn lp-btn-primary lp-btn-pill">Request Demo</Link>
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
          <a href="#features" onClick={closeMenu}>Features</a>
          <a href="#solutions" onClick={closeMenu}>Solutions</a>
          <a href="#how-it-works" onClick={closeMenu}>How It Works</a>
          <Link href="/request-demo" onClick={closeMenu}>Request Demo</Link>
        </div>
      </nav>

      <main>
        <header className="landing-hero">
          <div className="landing-container landing-hero-grid">
            <div className="landing-hero-copy">
              <div className="lp-trust-pill">
                <Verified size={14} aria-hidden />
                Trusted by Schools
              </div>

              <h1 className="hero-title">
                Student Safety <span>Starts Before</span> the School Bell Rings
              </h1>

              <p className="hero-description">
                OnTheBus helps schools manage transport operations with live tracking,
                student attendance, and real-time communication—giving parents peace of
                mind every single day.
              </p>

              <div className="hero-actions">
                <Link href="/request-demo" className="lp-btn lp-btn-primary lp-btn-lg">
                  Request Demo <ArrowRight size={18} />
                </Link>
                <a href="#how-it-works" className="lp-btn lp-btn-outline-green lp-btn-lg">
                  <Navigation size={18} /> See How It Works
                </a>
              </div>

              <ul className="hero-checks">
                <li><CheckCircle2 size={18} /> Live GPS Tracking</li>
                <li><CheckCircle2 size={18} /> Parent Notifications</li>
                <li><CheckCircle2 size={18} /> Student Attendance</li>
              </ul>
            </div>

            <div className="landing-hero-visual">
              <div className="lp-hero-glow" aria-hidden />
              <div className="lp-hero-dashboard">
                <img
                  src="/stitch/hero-dashboard.jpg"
                  alt="OnTheBus school admin dashboard with live bus map"
                  width={1000}
                  height={720}
                />
              </div>
              <div className="lp-hero-phone">
                <img
                  src="/stitch/hero-phone.jpg"
                  alt="OnTheBus parent app showing child bus status"
                  width={480}
                  height={960}
                />
              </div>
            </div>
          </div>
        </header>

        <section className="lp-trust-band" aria-label="Trusted schools">
          <div className="landing-container">
            <p className="lp-trust-label">Trusted by leading educational institutions</p>
            <div className="lp-trust-row">
              {TRUST.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="lp-section">
          <div className="landing-container">
            <div className="lp-section-header">
              <h2>Everything You Need to Keep Students Safe</h2>
              <p>
                One unified platform connecting schools, drivers, and parents for ultimate
                safety and operational efficiency.
              </p>
            </div>

            <div className="lp-features-grid">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article key={feature.title} className="lp-feature">
                    <div className={`lp-feature-icon${feature.danger ? " danger" : ""}`}>
                      <Icon size={22} />
                    </div>
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="lp-section lp-section-soft">
          <div className="landing-container">
            <div className="lp-section-header">
              <h2>A Seamless Journey From Start to Finish</h2>
              <p>Seven steps to total transparency and safety.</p>
            </div>

            <div className="lp-journey-desktop">
              <div
                className={`lp-steps${stepsVisible ? " is-visible" : ""}`}
                ref={stepsRef}
                role="tablist"
                aria-label="How OnTheBus works"
              >
                <div className="lp-steps-line" aria-hidden />
                {STEPS.map((step, index) => {
                  const StepIcon = step.icon;
                  const isActive = activeStep === index;
                  return (
                    <button
                      type="button"
                      key={step.title}
                      role="tab"
                      aria-selected={isActive}
                      aria-controls="journey-step-preview"
                      className={`lp-step${isActive ? " is-active" : ""}`}
                      style={{ transitionDelay: stepsVisible ? `${index * 70}ms` : "0ms" }}
                      onMouseEnter={() => setActiveStep(index)}
                      onFocus={() => setActiveStep(index)}
                      onClick={() => setActiveStep(index)}
                    >
                      <span className="lp-step-num">
                        <span aria-hidden>{index + 1}</span>
                        <StepIcon className="lp-step-icon" size={18} aria-hidden />
                      </span>
                      <span className="lp-step-title">{step.title}</span>
                    </button>
                  );
                })}
              </div>

              <article
                id="journey-step-preview"
                className="lp-journey-preview"
                role="tabpanel"
                aria-live="polite"
                key={STEPS[activeStep].title}
              >
                <div className="lp-journey-preview-media">
                  <Image
                    src={STEPS[activeStep].image}
                    alt={STEPS[activeStep].imageAlt}
                    width={1024}
                    height={576}
                    sizes="(min-width: 1024px) 60vw, 100vw"
                    quality={82}
                  />
                  <span className="lp-journey-preview-index" aria-hidden>
                    {String(activeStep + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="lp-journey-preview-copy">
                  <span className="lp-journey-kicker">Step {activeStep + 1} of {STEPS.length}</span>
                  <h3>{STEPS[activeStep].shortTitle}</h3>
                  <p>{STEPS[activeStep].description}</p>
                  <div className="lp-journey-preview-title">
                    <CheckCircle2 size={17} aria-hidden />
                    {STEPS[activeStep].title}
                  </div>
                </div>
              </article>
            </div>

            <div className="lp-steps-mobile" ref={stepsRef}>
              {STEPS.map((step, index) => {
                const StepIcon = step.icon;
                const isActive = activeStep === index;
                return (
                  <article
                    key={step.title}
                    className={`lp-step-mobile-row${isActive ? " is-active" : ""}`}
                  >
                    <button
                      type="button"
                      aria-expanded={isActive}
                      className="lp-step-mobile-trigger"
                      onClick={() => setActiveStep(index)}
                    >
                      <span className="lp-step-num">
                        <span aria-hidden>{index + 1}</span>
                        <StepIcon className="lp-step-icon" size={17} aria-hidden />
                      </span>
                      <span>{step.title}</span>
                      <ArrowRight className="lp-step-mobile-arrow" size={18} aria-hidden />
                    </button>
                    {isActive && (
                      <div className="lp-step-mobile-preview">
                        <Image
                          src={step.image}
                          alt={step.imageAlt}
                          width={1024}
                          height={576}
                          sizes="(max-width: 1023px) 100vw, 1px"
                          quality={80}
                        />
                        <div>
                          <strong>{step.shortTitle}</strong>
                          <p>{step.description}</p>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="solutions" className="lp-section">
          <div className="landing-container lp-stakeholder">
            <div>
              <h2>Powerful Platform. For Every Stakeholder.</h2>
              <div className="lp-stakeholder-list">
                <div className="lp-stakeholder-item">
                  <div className="lp-stakeholder-icon"><School size={24} /></div>
                  <div>
                    <h4>Schools in Control</h4>
                    <p>
                      Full operational visibility. Manage fleets, track student attendance
                      records, and ensure safety compliance across the entire district.
                    </p>
                  </div>
                </div>
                <div className="lp-stakeholder-item">
                  <div className="lp-stakeholder-icon"><UserRound size={24} /></div>
                  <div>
                    <h4>Drivers on the Road</h4>
                    <p>
                      Intuitive route navigation, digital manifests, and emergency tools that
                      keep drivers focused on safe driving rather than paperwork.
                    </p>
                  </div>
                </div>
                <div className="lp-stakeholder-item">
                  <div className="lp-stakeholder-icon"><HeartHandshake size={24} /></div>
                  <div>
                    <h4>Parents at Peace</h4>
                    <p>
                      Real-time arrival alerts, live tracking, and direct communication
                      channels. No more guessing when the bus will arrive.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="lp-stakeholder-visual">
              <img
                src="/stitch/stakeholder.jpg"
                alt="OnTheBus ecosystem across admin, driver, and parent apps"
                width={900}
                height={700}
              />
              <div className="lp-live-chip">
                <div className="lp-live-chip-icon"><Zap size={16} /></div>
                <div>
                  <strong>Live Connection</strong>
                  <span>Syncing every 2 seconds</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-metrics" aria-label="Platform metrics">
          <div className="landing-container lp-metrics-grid">
            <div>
              <Gauge size={36} />
              <strong>99.9%</strong>
              <span>Platform Availability</span>
            </div>
            <div>
              <Navigation size={36} />
              <strong>&lt; 5 Sec</strong>
              <span>GPS Updates</span>
            </div>
            <div>
              <Bell size={36} />
              <strong>2 Sec</strong>
              <span>Notification Delivery</span>
            </div>
            <div>
              <Cloud size={36} />
              <strong>100%</strong>
              <span>Cloud Based</span>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="landing-container">
            <div className="lp-section-header">
              <h2>Loved by Schools and Parents</h2>
            </div>
            <div className="lp-testimonials">
              {TESTIMONIALS.map((item) => (
                <blockquote key={item.name} className="lp-quote">
                  <Quote className="lp-quote-mark" size={40} aria-hidden />
                  <p>“{item.quote}”</p>
                  <footer>
                    <img src={item.avatar} alt="" width={48} height={48} className="lp-avatar-img" />
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.role}</span>
                    </div>
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="lp-cta-wrap">
          <div className="landing-container">
            <div className="lp-cta-banner">
              <h2>Give Parents Peace of Mind Every School Day</h2>
              <p>
                Join schools already using OnTheBus to ensure safer, smarter and more
                efficient school transport.
              </p>
              <div className="lp-cta-actions">
                <Link
                  href="/request-demo"
                  className="lp-btn lp-btn-white lp-btn-lg"
                >
                  Request Demo
                </Link>
                <a
                  href="mailto:sales@onthebus.app?subject=OnTheBus%20Sales"
                  className="lp-btn lp-btn-outline-white lp-btn-lg"
                >
                  Contact Sales
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container">
          <div className="lp-footer-grid">
            <div className="lp-footer-brand">
              <div className="lp-footer-brand-row">
                <img
                  src="/logo-footer.png"
                  alt="OnTheBus"
                  className="lp-footer-logo"
                  width={220}
                  height={80}
                />
              </div>
              <p>Pioneering safe and efficient student transportation solutions across East Africa.</p>
            </div>

            <div className="lp-footer-col">
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#solutions">Solutions</a>
              <a href="#contact">Pricing</a>
              <a href="#how-it-works">How It Works</a>
            </div>
            <div className="lp-footer-col">
              <h4>Resources</h4>
              <a href="#contact">Blog</a>
              <a href="#contact">Guides</a>
              <a href="#contact">FAQs</a>
              <a href="mailto:support@onthebus.app">Support</a>
            </div>
            <div className="lp-footer-col">
              <h4>Company</h4>
              <Link href="/about">About Us</Link>
              <Link href="/careers">Careers</Link>
              <Link href="/contact">Contact</Link>
            </div>
            <div className="lp-footer-col">
              <h4>Legal</h4>
              <Link href="/privacy">Privacy Policy</Link>
              <Link href="/terms">Terms of Service</Link>
              <Link href="/delete-account">Delete Account</Link>
            </div>
          </div>

          <div className="lp-footer-bottom">
            <p>&copy; {new Date().getFullYear()} OnTheBus. All rights reserved.</p>
            <div className="lp-store-badges">
              <a
                href="https://play.google.com/store"
                className="lp-store-badge"
                aria-label="Get it on Google Play"
                target="_blank"
                rel="noopener noreferrer"
              >
                {/* Official Google Play badge */}
                <img
                  src="/badges/google-play.png"
                  alt="Get it on Google Play"
                  width={155}
                  height={60}
                />
              </a>
              <a
                href="https://apps.apple.com"
                className="lp-store-badge lp-store-badge-apple"
                aria-label="Download on the App Store"
                target="_blank"
                rel="noopener noreferrer"
              >
                {/* Official App Store badge */}
                <img
                  src="/badges/app-store.svg"
                  alt="Download on the App Store"
                  width={135}
                  height={40}
                />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
