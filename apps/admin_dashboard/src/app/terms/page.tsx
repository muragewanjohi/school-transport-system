import type { Metadata } from "next";
import LegalDocPage from "@/components/LegalDocPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing use of the OnTheBus school transport platform and mobile apps.",
};

export default function TermsOfServicePage() {
  return (
    <LegalDocPage title="Terms of Service" updated="5 August 2026">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern access to and use of OnTheBus websites,
        admin consoles, and mobile applications (the &quot;Service&quot;). By accessing or using
        the Service, you agree to these Terms. If you are accepting on behalf of a school or
        organisation, you confirm you have authority to bind that organisation.
      </p>

      <h2>1. The Service</h2>
      <p>
        OnTheBus provides tools for school transport operations, including fleet visibility,
        driver/conductor trip workflows, student boarding manifests, NFC-assisted check-in, and
        parent notifications. Features may vary by plan, school configuration, and region.
      </p>

      <h2>2. Accounts and eligibility</h2>
      <ul>
        <li>School accounts are provisioned for authorised school or platform administrators</li>
        <li>Driver, conductor, and parent access is granted through the school that enrolls users</li>
        <li>You must provide accurate information and keep login credentials and OTP codes secure</li>
        <li>You must be legally able to use the Service in your jurisdiction</li>
      </ul>

      <h2>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Misuse location, boarding, or alert features in a way that endangers students or staff</li>
        <li>Attempt to access another school&apos;s data or bypass security or tenant controls</li>
        <li>Reverse engineer, scrape, or disrupt the Service except as allowed by law</li>
        <li>Upload unlawful, harmful, or infringing content</li>
        <li>Use the Service to send spam or non-transport promotional messaging</li>
      </ul>

      <h2>4. School responsibilities</h2>
      <p>Schools using OnTheBus are responsible for:</p>
      <ul>
        <li>Obtaining any required consents from parents/guardians for tracking and alerts</li>
        <li>Keeping student, guardian, route, and staff records accurate</li>
        <li>Configuring alert templates and operational policies appropriately</li>
        <li>Ensuring drivers and conductors are trained on safe use of the Driver app</li>
        <li>Complying with education, child-protection, and data-protection laws that apply to them</li>
      </ul>

      <h2>5. Mobile apps, location, and notifications</h2>
      <ul>
        <li>
          The Driver app may collect precise location during trips, including background location
          while a trip is active, which is required for core tracking and proximity alerts
        </li>
        <li>Parent alerts may be delivered by push notification and/or SMS</li>
        <li>
          SMS delivery depends on carrier and third-party gateway availability; we do not guarantee
          delivery timing in all network conditions
        </li>
      </ul>

      <h2>6. Fees and subscriptions</h2>
      <p>
        Paid school plans are billed according to the commercial terms agreed with OnTheBus (for
        example per-campus fees and usage-based messaging). Unpaid accounts may be suspended. Demo
        environments are temporary and may be deleted after expiry.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        OnTheBus and its licensors own the Service, branding, and software. Schools retain rights
        in the data they submit. You receive a limited, non-exclusive, non-transferable right to
        use the Service during an active subscription or authorised demo.
      </p>

      <h2>8. Third-party services</h2>
      <p>
        The Service may rely on third parties such as cloud hosting, maps, SMS gateways, and app
        stores. Those services have their own terms. We are not responsible for outages or acts
        outside our reasonable control.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. While
        OnTheBus is designed to improve transport visibility and communication, it is not a
        substitute for professional drivers, school safeguarding procedures, or emergency services.
        To the fullest extent permitted by law, we disclaim warranties of merchantability, fitness
        for a particular purpose, and non-infringement.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, OnTheBus and its suppliers will not be liable for
        indirect, incidental, special, consequential, or punitive damages, or for loss of profits,
        data, or goodwill. Our aggregate liability for claims relating to the Service is limited to
        the fees paid by the relevant school to OnTheBus for the Service in the three months before
        the claim (or, for free/demo use, KES 0).
      </p>

      <h2>11. Suspension and termination</h2>
      <p>
        We may suspend or terminate access for breach of these Terms, non-payment, legal risk, or
        misuse. Schools may stop using the Service according to their commercial agreement. Account
        and data deletion requests are handled as described in our{" "}
        <a href="/privacy">Privacy Policy</a> and{" "}
        <a href="/delete-account">Delete account</a> page.
      </p>

      <h2>12. Changes</h2>
      <p>
        We may update these Terms by posting a revised version on this page. Material changes will
        update the &quot;Last updated&quot; date. Continued use after changes constitutes acceptance
        of the revised Terms.
      </p>

      <h2>13. Governing law</h2>
      <p>
        These Terms are governed by the laws of Kenya, without regard to conflict-of-law rules.
        Courts in Kenya have exclusive jurisdiction, except where mandatory local consumer law
        provides otherwise.
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions about these Terms:{" "}
        <a href="mailto:support@onthebus.app">support@onthebus.app</a>
      </p>
    </LegalDocPage>
  );
}
