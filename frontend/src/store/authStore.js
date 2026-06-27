import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const TIER_KEY = 'cashbook_subscription_tier';

export const useAuthStore = create((set) => ({
  user:              null,
  session:           null,
  /** Persisted to SecureStore — readable before profile API returns, works offline */
  subscription_tier: null,
  /** True once the initial getSession() check in SupabaseAuthListener has resolved */
  authReady:         false,

  /** Called after login: profile object from /api/v1/profile + Supabase session */
  setUser: (user, session = null) => {
    const tier = user?.subscription_tier ?? null;
    if (tier) SecureStore.setItemAsync(TIER_KEY, tier).catch(() => {});
    set({ user, session, subscription_tier: tier, authReady: true });
  },

  clearUser: () => {
    SecureStore.deleteItemAsync(TIER_KEY).catch(() => {});
    set({ user: null, session: null, subscription_tier: null });
  },

  setAuthReady: () => set({ authReady: true }),
}));

// Hydrate subscription_tier from SecureStore so isFreeTier() is correct
// before the profile API responds (covers offline restarts for paid users).
SecureStore.getItemAsync(TIER_KEY)
  .then(tier => { if (tier) useAuthStore.setState({ subscription_tier: tier }); })
  .catch(() => {});
