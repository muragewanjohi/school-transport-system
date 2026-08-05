import Link from "next/link";
import type { ReactNode } from "react";

type LegalDocPageProps = Readonly<{
  title: string;
  updated: string;
  children: ReactNode;
}>;

export default function LegalDocPage({ title, updated, children }: LegalDocPageProps) {
  return (
    <div className="landing-page legal-page">
      <header className="legal-header">
        <div className="landing-container legal-header-inner">
          <Link href="/" className="legal-brand" aria-label="OnTheBus home">
            <img src="/logo.png" alt="OnTheBus" width={160} height={58} />
          </Link>
          <nav className="legal-nav" aria-label="Legal">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/delete-account">Delete account</Link>
          </nav>
        </div>
      </header>

      <main className="landing-container legal-main">
        <p className="legal-kicker">Legal</p>
        <h1>{title}</h1>
        <p className="legal-updated">Last updated: {updated}</p>
        <div className="legal-body">{children}</div>
      </main>

      <footer className="legal-footer">
        <div className="landing-container legal-footer-inner">
          <p>&copy; {new Date().getFullYear()} OnTheBus. All rights reserved.</p>
          <div className="legal-footer-links">
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/delete-account">Delete account</Link>
            <Link href="/">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
