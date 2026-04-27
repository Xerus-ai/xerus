export const PLANS = {
  pro:   { label: 'Pro',   credits: 500,   monthly: 19,  annual: 15,  vcpu: 1, ram: 2,  disk: 10  },
  max:   { label: 'Max',   credits: 2000,  monthly: 49,  annual: 39,  vcpu: 2, ram: 4,  disk: 25  },
  ultra: { label: 'Ultra', credits: 10000, monthly: 149, annual: 119, vcpu: 4, ram: 8,  disk: 50  },
} as const;

export type PlanType = keyof typeof PLANS;
