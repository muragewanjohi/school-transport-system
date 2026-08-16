"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  DEFAULT_PRICING_NEEDS,
  formatCapLabel,
  formatKesMonthly,
  pricingMailto,
  recommendPlan,
} from "@/lib/pricingPlans";

function sliderDisplay(value: number, max: number): string {
  const formatted = value.toLocaleString("en-KE");
  return value >= max ? `${formatted}+` : formatted;
}

export default function PricingCalculator() {
  const [students, setStudents] = useState(DEFAULT_PRICING_NEEDS.students);
  const [buses, setBuses] = useState(DEFAULT_PRICING_NEEDS.buses);
  const [locations, setLocations] = useState(DEFAULT_PRICING_NEEDS.locations);

  const plan = useMemo(
    () => recommendPlan({ students, buses, locations }),
    [students, buses, locations]
  );

  const isEnterprise = plan.id === "enterprise";
  const ctaHref = isEnterprise
    ? pricingMailto("OnTheBus Enterprise pricing")
    : "/request-demo";
  const ctaLabel = isEnterprise ? "Contact Sales" : "Request Demo";

  return (
    <div className="pricing-calc">
      <div className="pricing-calc-inputs">
        <h2>Not sure which plan fits? Calculate your needs</h2>
        <p>Move the sliders to match your school. We recommend the smallest plan that covers all three.</p>

        <label className="pricing-slider">
          <span>
            Number of students
            <strong>{sliderDisplay(students, 1000)}</strong>
          </span>
          <input
            type="range"
            min={0}
            max={1000}
            step={10}
            value={students}
            onChange={(event) => setStudents(Number(event.target.value))}
            aria-valuetext={sliderDisplay(students, 1000)}
          />
        </label>

        <label className="pricing-slider">
          <span>
            Number of buses
            <strong>{sliderDisplay(buses, 20)}</strong>
          </span>
          <input
            type="range"
            min={0}
            max={20}
            step={1}
            value={buses}
            onChange={(event) => setBuses(Number(event.target.value))}
            aria-valuetext={sliderDisplay(buses, 20)}
          />
        </label>

        <label className="pricing-slider">
          <span>
            Number of locations
            <strong>{sliderDisplay(locations, 10)}</strong>
          </span>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={locations}
            onChange={(event) => setLocations(Number(event.target.value))}
            aria-valuetext={sliderDisplay(locations, 10)}
          />
        </label>
      </div>

      <aside className="pricing-calc-result">
        <p className="pricing-calc-kicker">Recommended plan</p>
        <h3>{plan.name}</h3>
        <p className="pricing-calc-price">
          <strong>{formatKesMonthly(plan.monthlyKes)}</strong>
          {plan.monthlyKes !== null ? <span> /month</span> : null}
        </p>
        <ul className="pricing-calc-caps">
          <li>{formatCapLabel(plan.maxStudents, "students")}</li>
          <li>{formatCapLabel(plan.maxBuses, "buses")}</li>
          <li>{formatCapLabel(plan.maxLocations, "locations")}</li>
        </ul>
        {isEnterprise ? (
          <a href={ctaHref} className="lp-btn lp-btn-enterprise lp-btn-lg">
            {ctaLabel}
          </a>
        ) : (
          <Link href={ctaHref} className="lp-btn lp-btn-primary lp-btn-lg">
            {ctaLabel}
          </Link>
        )}
        <a href="#plans" className="pricing-calc-details">
          View full plan details <ArrowRight size={16} aria-hidden />
        </a>
      </aside>
    </div>
  );
}
