import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  Crown,
  Mail,
  MessageSquareOff,
  School,
  Sprout,
  type LucideIcon,
} from "lucide-react";
import MarketingShell from "@/components/MarketingShell";
import PricingCalculator from "@/components/PricingCalculator";
import {
  ALL_PLANS_FEATURES,
  PRICING_CONTACT_EMAIL,
  PRICING_PLANS,
  formatKesMonthly,
  pricingMailto,
  type PlanId,
} from "@/lib/pricingPlans";

const PLAN_ICONS: Record<PlanId, LucideIcon> = {
  starter: Sprout,
  school: School,
  growth: BarChart3,
  enterprise: Crown,
};

const FAQS = [
  {
    question: "Can I change my plan later?",
    answer:
      "Yes. Start with the plan that fits today and email us or request a demo when you are ready to upgrade or downsize.",
  },
  {
    question: "Is there a setup fee?",
    answer: "No. There is no setup fee on any plan.",
  },
  {
    question: "What happens if I exceed my limits?",
    answer:
      "We will help you move to the next plan that covers your students, buses, and locations. Limits are not silently overage-billed.",
  },
  {
    question: "Do you offer annual billing?",
    answer: `Ask us at ${PRICING_CONTACT_EMAIL} — we can discuss annual invoicing for your school.`,
  },
  {
    question: "Are SMS notifications included?",
    answer:
      "No. SMS notifications are billed separately on every plan. Push notifications stay in-plan.",
  },
] as const;

export default function PricingPage() {
  return (
    <MarketingShell active="pricing">
      <section className="pricing-hero">
        <div className="landing-container pricing-hero-grid">
          <div className="pricing-hero-copy">
            <p className="lp-trust-pill">Simple, transparent, fair</p>
            <h1>
              Pricing that grows <span>with your school</span>
            </h1>
            <p className="pricing-hero-lede">
              Choose the plan that fits your school today. Upgrade anytime as your
              transport operation grows.
            </p>
            <ul className="hero-checks">
              <li>
                <Check size={16} aria-hidden />
                14-day demo
              </li>
              <li>
                <Check size={16} aria-hidden />
                No setup fee
              </li>
              <li>
                <Check size={16} aria-hidden />
                Cancel anytime
              </li>
            </ul>
          </div>
          <figure className="pricing-hero-media">
            <Image
              src="/stitch/apps_hero_image.png"
              alt="OnTheBus admin dashboard with live fleet tracking, driver app, and parent app"
              width={1535}
              height={1024}
              priority
            />
          </figure>
        </div>
      </section>

      <section id="plans" className="lp-section pricing-plans" aria-label="Plans">
        <div className="landing-container">
          <div className="pricing-plan-grid">
            {PRICING_PLANS.map((plan) => {
              const Icon = PLAN_ICONS[plan.id];
              const isEnterprise = plan.id === "enterprise";
              const isPopular = Boolean(plan.popular);
              return (
                <article
                  key={plan.id}
                  className={`pricing-card${isPopular ? " is-popular" : ""}${
                    isEnterprise ? " is-enterprise" : ""
                  }`}
                >
                  {isPopular ? <p className="pricing-card-badge">Most popular</p> : null}
                  <div className="pricing-card-icon" aria-hidden>
                    <Icon size={22} />
                  </div>
                  <h2>{plan.name}</h2>
                  <p className="pricing-card-desc">{plan.description}</p>
                  <p className="pricing-card-price">
                    <strong>{formatKesMonthly(plan.monthlyKes)}</strong>
                    {plan.monthlyKes !== null ? <span> /month</span> : null}
                  </p>
                  <ul className="pricing-card-features">
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <Check size={16} aria-hidden />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {isEnterprise ? (
                    <a
                      href={pricingMailto("OnTheBus Enterprise pricing")}
                      className="lp-btn lp-btn-enterprise lp-btn-lg"
                    >
                      Contact Sales
                    </a>
                  ) : (
                    <Link
                      href="/request-demo"
                      className={`lp-btn lp-btn-lg ${
                        isPopular ? "lp-btn-primary" : "lp-btn-outline-green"
                      }`}
                    >
                      Request Demo
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="pricing-sms" aria-label="SMS notifications">
        <div className="landing-container">
          <div className="pricing-sms-card">
            <span className="pricing-sms-icon" aria-hidden>
              <MessageSquareOff size={22} />
            </span>
            <div>
              <h2>SMS notifications are not included</h2>
              <p>
                Every monthly plan includes push notifications. SMS alerts are billed
                separately as a usage meter.{" "}
                <a href={pricingMailto("OnTheBus SMS notification pricing")}>
                  Email {PRICING_CONTACT_EMAIL}
                </a>{" "}
                for usage details.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section pricing-calc-section">
        <div className="landing-container">
          <PricingCalculator />
        </div>
      </section>

      <section className="pricing-included" aria-label="Included in every plan">
        <div className="landing-container">
          <p>Included in every plan</p>
          <ul>
            {ALL_PLANS_FEATURES.map((feature) => (
              <li key={feature}>
                <Check size={14} aria-hidden />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="lp-section pricing-faq-section" aria-label="Frequently asked questions">
        <div className="landing-container pricing-faq-layout">
          <div>
            <h2>Questions schools ask first</h2>
            <div className="pricing-faq-list">
              {FAQS.map((item) => (
                <details key={item.question} className="pricing-faq">
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>

          <aside className="pricing-help">
            <h3>Need help choosing?</h3>
            <p>Tell us about your fleet and we will recommend a plan.</p>
            <p className="pricing-help-email">
              <Mail size={16} aria-hidden />
              <a href={pricingMailto("OnTheBus pricing help")}>{PRICING_CONTACT_EMAIL}</a>
            </p>
            <Link href="/request-demo" className="lp-btn lp-btn-primary lp-btn-pill">
              Request a Demo
              <ArrowRight size={16} aria-hidden />
            </Link>
          </aside>
        </div>
      </section>
    </MarketingShell>
  );
}
