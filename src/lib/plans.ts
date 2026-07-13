// Plan versions. GRANDFATHERING RULE: never edit an existing version's values.
// To change pricing/limits, add a NEW version key (e.g. v2) and route new signups to it.

export interface PlanVersion {
  free_minutes: number;
  pro_monthly: number;
  pro_minutes: number;
}

export const PLANS: Record<string, PlanVersion> = {
  v1: {
    free_minutes: 120,
    pro_monthly: 9.99,
    pro_minutes: 1500,
  },
};

// The version new users are provisioned onto. Existing users keep their stored version.
export const CURRENT_PLAN_VERSION = 'v1';

export function planFor(version: string): PlanVersion {
  return PLANS[version] ?? PLANS[CURRENT_PLAN_VERSION];
}
