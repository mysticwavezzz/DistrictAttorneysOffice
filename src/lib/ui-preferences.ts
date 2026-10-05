const DASHBOARD_FOLD_PREFIX = "da-dashboard-folds:v1:";
const PRIVACY_CONSENT_PREFIX = "da-optional-analytics:v2:";

export function privacyConsentKey(generation: string) {
  return `${PRIVACY_CONSENT_PREFIX}${generation}`;
}

function storageAvailable() {
  return typeof window !== "undefined";
}

export function readDashboardFoldPreferences(accountId: string): Record<string, boolean> {
  if (!storageAvailable()) return {};
  try {
    const value = window.localStorage.getItem(`${DASHBOARD_FOLD_PREFIX}${accountId}`);
    if (!value) return {};
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
  } catch {
    return {};
  }
}

export function saveDashboardFoldPreference(accountId: string, sectionId: string, open: boolean) {
  if (!storageAvailable()) return;
  try {
    const preferences = readDashboardFoldPreferences(accountId);
    preferences[sectionId] = open;
    window.localStorage.setItem(`${DASHBOARD_FOLD_PREFIX}${accountId}`, JSON.stringify(preferences));
  } catch {
    // Keep the disclosure usable if browser storage is disabled or full.
  }
}

export function clearDashboardFoldPreferences() {
  if (!storageAvailable()) return;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(DASHBOARD_FOLD_PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // Sign-out should still proceed if browser storage is unavailable.
  }
}

export function clearPrivacyConsent() {
  if (!storageAvailable()) return;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key === "da-optional-analytics" || key?.startsWith(PRIVACY_CONSENT_PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // Consent can be asked again on a later visit if storage is blocked.
  }
}
