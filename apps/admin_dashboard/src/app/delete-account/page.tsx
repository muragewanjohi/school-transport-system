import type { Metadata } from "next";
import LegalDocPage from "@/components/LegalDocPage";

export const metadata: Metadata = {
  title: "Delete Account",
  description:
    "How parents, drivers, and school staff can request deletion of their OnTheBus account and related data.",
};

export default function DeleteAccountPage() {
  return (
    <LegalDocPage title="Delete your OnTheBus account" updated="5 August 2026">
      <p>
        OnTheBus accounts for parents, drivers, and conductors are created and managed through the
        school that uses our platform. Because student transport records belong to the school
        relationship, the fastest and most accurate way to remove your account is to contact your
        school first.
      </p>

      <h2>1. Request deletion through your school (recommended)</h2>
      <ol>
        <li>Contact your school&apos;s transport office or school administrator.</li>
        <li>
          Ask them to remove your parent, driver, or conductor profile from OnTheBus and to stop
          alerts to your phone number.
        </li>
        <li>
          If you are a parent, ask them to update or remove guardian details linked to your
          child(ren) as appropriate.
        </li>
      </ol>
      <p>
        School admins can deactivate or remove staff/parent records from the OnTheBus admin console
        for their school. Once removed, you should no longer receive trip alerts for that school,
        and your login should stop working after their change takes effect.
      </p>

      <h2>2. If your school does not respond</h2>
      <p>
        Email us at{" "}
        <a href="mailto:support@onthebus.app?subject=Account%20deletion%20request">
          support@onthebus.app
        </a>{" "}
        with:
      </p>
      <ul>
        <li>Full name</li>
        <li>Phone number used in the Parent or Driver app</li>
        <li>School name</li>
        <li>Whether you are a parent, driver, conductor, or school admin</li>
        <li>A clear request to delete your account and associated personal data</li>
      </ul>
      <p>
        We will verify the request and work with the school tenant record to delete or anonymise
        your personal data. We aim to complete verified deletion requests within 30 days, unless a
        longer period is required by law or to resolve an open safety/billing matter.
      </p>

      <h2>3. What gets deleted</h2>
      <ul>
        <li>Your app login / OTP phone association for that school where applicable</li>
        <li>Parent or staff profile contact details tied to your account</li>
        <li>Push tokens and notification preferences linked to your device account</li>
      </ul>

      <h2>4. What may be retained</h2>
      <ul>
        <li>
          Aggregated or anonymised operational metrics that no longer identify you
        </li>
        <li>
          Limited records we must keep for legal, security, fraud-prevention, or accounting reasons
        </li>
        <li>
          Student transport history that the school is legally required to retain (managed under the
          school&apos;s retention duties). Where possible, your personal identifiers are removed or
          replaced
        </li>
      </ul>

      <h2>5. Demo accounts</h2>
      <p>
        Temporary demo school environments expire automatically and are purged after the demo
        period. You may still email support if you want confirmation that a demo phone number was
        removed sooner.
      </p>

      <h2>6. Related policies</h2>
      <p>
        See our <a href="/privacy">Privacy Policy</a> for how we collect and use data, and our{" "}
        <a href="/terms">Terms of Service</a> for general use of the platform.
      </p>
    </LegalDocPage>
  );
}
