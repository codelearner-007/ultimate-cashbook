/**
 * Dev-only LAN host auto-detection.
 *
 * Problem: EXPO_PUBLIC_API_URL / EXPO_PUBLIC_SUPABASE_URL in .env hardcode the
 * dev machine's LAN IP so a physical device (Expo Go) can reach them. That IP
 * is DHCP-assigned and changes across reconnects/reboots/networks, silently
 * going stale and breaking native dev builds with "Network request failed"
 * until someone notices and hand-edits .env.
 *
 * Fix: Expo Go/dev-client already know the exact current IP — it's the host
 * they used to load the JS bundle over Metro (`Constants.expoConfig.hostUri`,
 * e.g. "192.168.0.102:8081"). Reuse that host instead of trusting .env, so
 * this class of bug can't happen for native dev again. Backend/Supabase ports
 * are fixed (8000 / 54321) and passed in by the caller.
 */
import Constants from 'expo-constants';

export function getDevLanHost() {
  const hostUri = Constants.expoConfig?.hostUri || Constants.expoGoConfig?.hostUri;
  if (!hostUri) return null;
  const host = hostUri.split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;
  return host;
}

/**
 * Resolves a service URL for native dev builds by swapping in the live-detected
 * LAN host, falling back to the .env value when detection isn't possible
 * (production builds have no Metro hostUri, so they use envFallback as-is).
 */
export function resolveDevUrl(port, envFallback) {
  if (!__DEV__) return envFallback;
  const host = getDevLanHost();
  return host ? `http://${host}:${port}` : envFallback;
}
