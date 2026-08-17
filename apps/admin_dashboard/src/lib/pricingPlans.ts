export type PlanId = "starter" | "school" | "growth" | "enterprise";

export type PricingNeeds = {
  students: number;
  buses: number;
  locations: number;
};

export type PricingPlan = {
  id: PlanId;
  name: string;
  description: string;
  monthlyKes: number | null;
  maxStudents: number | null;
  maxBuses: number | null;
  maxLocations: number | null;
  features: readonly string[];
  popular?: boolean;
};

export const PRICING_CONTACT_EMAIL = "info@onthebusapp.com";

export const DEFAULT_PRICING_NEEDS: PricingNeeds = {
  students: 250,
  buses: 5,
  locations: 2,
};

export const ALL_PLANS_FEATURES = [
  "Live tracking",
  "Parent app",
  "Driver / conductor app",
  "Route management",
  "Reports",
  "Push notifications",
] as const;

export function pricingMailto(subject: string): string {
  return `mailto:${PRICING_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export const PRICING_PLANS: readonly PricingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Perfect for small schools just getting started.",
    monthlyKes: 5000,
    maxStudents: 100,
    maxBuses: 2,
    maxLocations: 1,
    features: [
      "Up to 100 students",
      "Up to 2 buses",
      "1 location",
      "Live bus tracking",
      "Parent & driver apps",
      "Route & stop management",
      "Basic reports",
      "Push notifications",
    ],
  },
  {
    id: "school",
    name: "School",
    description: "Everything you need to run your school transport smoothly.",
    monthlyKes: 10000,
    maxStudents: 300,
    maxBuses: 6,
    maxLocations: 3,
    popular: true,
    features: [
      "Up to 300 students",
      "Up to 6 buses",
      "Up to 3 locations",
      "Student boarding & drop-off",
      "Delay management",
      "Automatic ETA",
      "SOS alerts",
      "Advanced reports",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    description: "For growing schools with bigger transport operations.",
    monthlyKes: 15000,
    maxStudents: 600,
    maxBuses: 10,
    maxLocations: 5,
    features: [
      "Up to 600 students",
      "Up to 10 buses",
      "Up to 5 locations",
      "Custom roles & permissions",
      "API access",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "For large schools and multi-campus groups.",
    monthlyKes: null,
    maxStudents: null,
    maxBuses: null,
    maxLocations: null,
    features: [
      "600+ students",
      "10+ buses",
      "Unlimited locations",
      "Dedicated account manager",
      "Custom integrations",
      "SLA & uptime guarantee",
      "Onboarding & training",
    ],
  },
] as const;

function planCovers(plan: PricingPlan, needs: PricingNeeds): boolean {
  const studentsOk = plan.maxStudents === null || needs.students <= plan.maxStudents;
  const busesOk = plan.maxBuses === null || needs.buses <= plan.maxBuses;
  const locationsOk = plan.maxLocations === null || needs.locations <= plan.maxLocations;
  return studentsOk && busesOk && locationsOk;
}

export function recommendPlan(needs: PricingNeeds): PricingPlan {
  const match = PRICING_PLANS.find((plan) => planCovers(plan, needs));
  return match ?? PRICING_PLANS[PRICING_PLANS.length - 1];
}

export function formatKesMonthly(amount: number | null): string {
  if (amount === null) {
    return "Custom";
  }
  return `KSh ${amount.toLocaleString("en-KE")}`;
}

export function formatCapLabel(
  value: number | null,
  unit: "students" | "buses" | "locations"
): string {
  if (value === null) {
    if (unit === "locations") {
      return "Unlimited locations";
    }
    if (unit === "students") {
      return "600+ students";
    }
    return "10+ buses";
  }
  if (unit === "locations" && value === 1) {
    return "1 location";
  }
  return `Up to ${value} ${unit}`;
}

export type PlanUsageMetric = {
  used: number;
  cap: number | null;
  over: boolean;
  display: string;
};

export type PlanUsageBreakdown = {
  students: PlanUsageMetric;
  buses: PlanUsageMetric;
  locations: PlanUsageMetric;
};

export function formatUsageAgainstCap(used: number, cap: number | null): string {
  const usedLabel = used.toLocaleString("en-KE");
  if (cap === null) {
    return `${usedLabel} / Unlimited`;
  }
  return `${usedLabel} / ${cap.toLocaleString("en-KE")}`;
}

export function usageMetric(used: number, cap: number | null): PlanUsageMetric {
  return {
    used,
    cap,
    over: cap !== null && used > cap,
    display: formatUsageAgainstCap(used, cap),
  };
}

export function usageAgainstPlan(plan: PricingPlan, needs: PricingNeeds): PlanUsageBreakdown {
  return {
    students: usageMetric(needs.students, plan.maxStudents),
    buses: usageMetric(needs.buses, plan.maxBuses),
    locations: usageMetric(needs.locations, plan.maxLocations),
  };
}

export function capUsagePercent(used: number, cap: number | null): number {
  if (cap === null || cap <= 0) return 0;
  return Math.min(100, Math.round((used / cap) * 100));
}

export function upgradePlanAction(planId: PlanId): { label: string; href: string } {
  if (planId === "enterprise") {
    return {
      label: "Contact sales",
      href: pricingMailto("Enterprise plan inquiry"),
    };
  }
  return {
    label: "Upgrade plan",
    href: "/pricing",
  };
}

