// Subscription plan metadata — single source of truth for colors and labels.
// Both SubscriptionScreen and AdminUsersScreen import from here.
// `color: null` means "use C.primary from the active theme at render time".

export const PLAN_META = {
  free:     { color: null,      name: 'Free',     crown: false },
  pro:      { color: '#F59E0B', name: 'Pro',      crown: true  },
  business: { color: '#7C3AED', name: 'Business', crown: true  },
};

/** Returns the resolved accent color for a tier, falling back to C.primary. */
export const planColor = (tier, primary) =>
  PLAN_META[tier]?.color ?? primary;

/** Returns a human-readable plan label: "Free" | "Pro · Monthly" | "Business · Yearly" etc. */
export const planLabel = (tier, cycle) => {
  if (!tier || tier === 'free') return 'Free';
  const name = PLAN_META[tier]?.name ?? tier;
  const c    = cycle === 'yearly' ? 'Yearly' : 'Monthly';
  return `${name} · ${c}`;
};
