// Web stub — push notifications are native-only.
// Metro resolves this file on web; the .native.js variant is used on iOS/Android.

export function setupNotificationHandlers() {}
export async function registerPushToken() {}
export function addNotificationTapListener(_cb) {
  return { remove: () => {} };
}

export function scheduleLocalNotification() {}
