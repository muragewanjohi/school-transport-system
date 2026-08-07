"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

type MarketingShellProps = Readonly<{
  active?: "about" | "careers" | "contact";
  children: ReactNode;
}>;

export default function MarketingShell({ active, children }: MarketingShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="landing-page company-page">
      <nav className="landing-nav company-nav" aria-label="Primary">
        <div className="landing-container landing-nav-inner">
          <Link href="/" className="landing-brand" aria-label="OnTheBus home">
            <img
              src="/logo.png"
              alt="OnTheBus"
              className="landing-brand-logo"
              width={160}
              height={58}
            />
          </Link>

          <ul className="landing-menu-links">
            <li>
              <Link href="/about" className={active === "about" ? "is-active" : undefined}>
                About
              </Link>
            </li>
            <li>
              <Link href="/careers" className={active === "careers" ? "is-active" : undefined}>
                Careers
              </Link>
            </li>
            <li>
              <Link href="/contact" className={active === "contact" ? "is-active" : undefined}>
                Contact
              </Link>
            </li>
          </ul>

          <div className="landing-nav-actions">
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
          <Link href="/about" onClick={() => setMenuOpen(false)}>
            About
          </Link>
          <Link href="/careers" onClick={() => setMenuOpen(false)}>
            Careers
          </Link>
          <Link href="/contact" onClick={() => setMenuOpen(false)}>
            Contact
          </Link>
          <Link href="/request-demo" onClick={() => setMenuOpen(false)}>
            Request Demo
          </Link>
        </div>
      </nav>

      <main>{children}</main>

      <footer className="legal-footer">
        <div className="landing-container legal-footer-inner">
          <p>&copy; {new Date().getFullYear()} OnTheBus. All rights reserved.</p>
          <div className="legal-footer-links">
            <Link href="/about">About</Link>
            <Link href="/careers">Careers</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
