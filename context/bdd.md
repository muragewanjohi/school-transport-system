# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Public marketing pricing page |
| **Stack** | `nextjs` (`apps/admin_dashboard`) |
| **Owner path(s)** | `apps/admin_dashboard/src/lib/pricingPlans.ts`, `apps/admin_dashboard/src/components/PricingCalculator.tsx`, `apps/admin_dashboard/src/app/pricing/page.tsx` |
| **Started** | 2026-08-16 |
| **Status** | `passing` |

## Goal

Visitors on apex `/pricing` see Starter / School / Growth / Enterprise tiers (School = 6 buses) and a needs calculator that recommends the cheapest plan covering students, buses, and locations. SMS notifications are excluded from every plan.

## Scenarios

```gherkin
Feature: Public pricing plan recommendation

  Scenario: School-sized needs recommend School
    Given a visitor sets students to 300, buses to 6, and locations to 2
    When the pricing calculator recommends a plan
    Then the recommended plan is School

  Scenario: One extra bus past School recommends Growth
    Given a visitor sets students to 300, buses to 7, and locations to 3
    When the pricing calculator recommends a plan
    Then the recommended plan is Growth

  Scenario: Needs above Growth caps recommend Enterprise
    Given a visitor sets students to 601, buses to 11, and locations to 6
    When the pricing calculator recommends a plan
    Then the recommended plan is Enterprise

  Scenario: /pricing is a public marketing path
    Given an unauthenticated visitor
    When they open /pricing
    Then the path is treated as a public marketing page
```

## Automation map

| Scenario title | Test / verification | Status |
| :--- | :--- | :--- |
| School-sized needs recommend School | `src/lib/pricingPlans.test.ts` | `passing` |
| One extra bus past School recommends Growth | `src/lib/pricingPlans.test.ts` | `passing` |
| Needs above Growth caps recommend Enterprise | `src/lib/pricingPlans.test.ts` | `passing` |
| /pricing is a public marketing path | `src/lib/tenantHost.test.ts` | `passing` |
