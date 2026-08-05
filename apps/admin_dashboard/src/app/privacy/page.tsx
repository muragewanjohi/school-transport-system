import type { Metadata } from "next";
import LegalDocPage from "@/components/LegalDocPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How OnTheBus collects, uses, and protects personal information for schools, parents, and drivers.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalDocPage title="Privacy Policy" updated="5 August 2026">
      <p>
        OnTheBus (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) provides school transport
        tracking, boarding, and parent-alert services for private schools. This Privacy Policy
        explains what information we collect, why we collect it, and the choices available to you.
        It is written to align with common mobile-store expectations (including Google Play&apos;s
        Data safety disclosures) and privacy practices used by similar education and location
        services.
      </p>

      <h2>1. Who this policy covers</h2>
      <ul>
        <li>School administrators using the OnTheBus web console</li>
        <li>Drivers and conductors using the OnTheBus Driver app</li>
        <li>Parents and guardians using the OnTheBus Parent app or receiving SMS/push alerts</li>
        <li>Students whose transport and boarding records are managed by their school</li>
      </ul>
      <p>
        Schools are typically the primary controllers of student and parent contact data they
        enroll. OnTheBus processes that data to provide the service under each school&apos;s
        instructions and applicable law.
      </p>

      <h2>2. Information we collect</h2>
      <h3>Account and contact information</h3>
      <ul>
        <li>Names, roles, work email addresses, and phone numbers for school staff</li>
        <li>Phone numbers used to sign in parents, drivers, or conductors (for example via OTP)</li>
        <li>Parent/guardian contact details provided by the school for alerts</li>
      </ul>
      <h3>Student transport information</h3>
      <ul>
        <li>Student name, route/stop assignment, and boarding status</li>
        <li>Encrypted or hashed NFC badge identifiers (not raw card secrets in plain form)</li>
        <li>Attendance and trip history associated with school transport</li>
      </ul>
      <h3>Location information</h3>
      <ul>
        <li>
          Precise location from the Driver app during active trips (including background location
          when a trip is running) to power live tracking, proximity alerts, and safety features
        </li>
        <li>Map display location for parents viewing their child&apos;s bus during a trip</li>
        <li>School-configured stop or campus locations</li>
      </ul>
      <h3>Device and usage information</h3>
      <ul>
        <li>App version, device type, crash/diagnostic data, and approximate network info</li>
        <li>Push notification tokens where notifications are enabled</li>
      </ul>
      <h3>Communications</h3>
      <ul>
        <li>SMS and in-app/push alert content related to boarding, proximity, and trip events</li>
        <li>Support and demo-request messages you send us</li>
      </ul>

      <h2>3. How we use information</h2>
      <ul>
        <li>Operate live fleet tracking, manifests, and parent alerts</li>
        <li>Authenticate users and secure school-scoped access</li>
        <li>Send transactional SMS/push notifications requested by the school&apos;s configuration</li>
        <li>Provide school admin reporting (attendance, trips, billing metrics)</li>
        <li>Improve reliability, prevent abuse, and comply with legal obligations</li>
      </ul>
      <p>We do not sell personal information.</p>

      <h2>4. How we share information</h2>
      <p>We share information only as needed to run the service, including:</p>
      <ul>
        <li>
          <strong>Your school</strong> — administrators and authorised staff for the school that
          enrolled you or your child
        </li>
        <li>
          <strong>Service providers</strong> — hosting, database, maps, SMS gateway, and email
          providers that process data on our instructions (for example cloud infrastructure and
          Africa&apos;s Talking for SMS)
        </li>
        <li>
          <strong>Legal requirements</strong> — when required by law, regulation, or valid legal
          process, or to protect the safety of students, users, or the public
        </li>
      </ul>
      <p>
        Multi-tenant controls are designed so one school cannot access another school&apos;s
        student, parent, or fleet data.
      </p>

      <h2>5. Data retention</h2>
      <ul>
        <li>Account and roster data is retained while the school subscription or demo is active</li>
        <li>
          High-resolution telemetry is retained for a limited operational window (approximately 7
          days) and then pruned
        </li>
        <li>
          After a school ends service or a deletion request is completed, personal data is deleted
          or anonymised within a reasonable period, except where we must keep records for legal,
          security, or billing reasons
        </li>
      </ul>

      <h2>6. Security</h2>
      <p>
        We use industry-standard safeguards such as encryption in transit (HTTPS/TLS), access
        controls, tenant isolation, and least-privilege service roles. No method of transmission or
        storage is 100% secure; please protect OTP codes and admin credentials.
      </p>

      <h2>7. Children&apos;s information</h2>
      <p>
        OnTheBus is used in a school context and may process children&apos;s transport data provided
        by schools. We do not offer the service for children to create accounts independently. Parents
        and schools should contact each other (and us if needed) about student data requests.
      </p>

      <h2>8. Your choices and rights</h2>
      <ul>
        <li>Parents and staff may update contact preferences through their school administrator</li>
        <li>
          You may request access, correction, or deletion of personal data as described on our{" "}
          <a href="/delete-account">Delete account</a> page
        </li>
        <li>You can disable push notifications in device settings; SMS may still be sent by the school&apos;s alert rules</li>
        <li>Drivers can stop location sharing by ending the trip and signing out</li>
      </ul>

      <h2>9. International processing</h2>
      <p>
        Data may be processed in Kenya and in other regions where our cloud providers operate. We
        take steps appropriate to the service to protect personal data during transfer and hosting.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will post the updated version on
        this page and revise the &quot;Last updated&quot; date. Continued use of the service after
        changes means you acknowledge the updated policy.
      </p>

      <h2>11. Contact</h2>
      <p>
        Privacy questions:{" "}
        <a href="mailto:support@onthebus.app">support@onthebus.app</a>
        <br />
        For student or parent records managed by a school, start with your school&apos;s transport
        administrator.
      </p>
    </LegalDocPage>
  );
}
