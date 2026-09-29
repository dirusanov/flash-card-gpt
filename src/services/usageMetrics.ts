/**
 * Anonymous daily active-user counter.
 *
 * Deliberately carries no identifier: the payload is the UTC day and the extension version,
 * nothing else. Deduplication happens on the device, so the server never needs to tell one
 * installation from another — it only increments a counter. Privacy here is a property of the
 * design, not a promise in a policy.
 *
 * Two invariants keep it that way, and both are easy to break by accident:
 *   - `credentials: 'omit'` — the endpoint sits on the same host as auth, so without this the
 *     browser would attach the session cookie and de-anonymize every ping.
 *   - the server must not log the IP, at every layer that sees the request (CDN and WAF keep
 *     their own access logs regardless of the origin's configuration).
 *
 * Adding fields breaks the "aggregate audience measurement" exemption this relies on: a
 * combination of attributes eventually identifies a person even when no single one does. Any
 * new field needs the consent toggle that `isMetricsEnabled` is already shaped to read.
 */

// Same host as the sync API, but a constant rather than the user-configurable `syncApiUrl`:
// a changed sync endpoint must not redirect the counter somewhere else.
const METRICS_ENDPOINT = 'https://api-cards.vaultonote.com/metrics/daily';
const LAST_PING_DAY_KEY = 'vaulto_metrics_last_ping_day';
const METRICS_ENABLED_KEY = 'vaulto_metrics_enabled';

// Guards against the several wake-up paths racing on a cold service worker.
let inFlight: Promise<void> | null = null;

const getChromeStorage = () => {
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      return chrome.storage.local;
    }
  } catch {
    // Nothing to do: without storage there is no way to deduplicate, so skip the ping.
  }
  return null;
};

const readStorage = (
  storage: chrome.storage.LocalStorageArea,
  keys: string[],
): Promise<Record<string, unknown>> =>
  new Promise((resolve) => {
    try {
      storage.get(keys, (items) => {
        resolve(chrome?.runtime?.lastError ? {} : items || {});
      });
    } catch {
      resolve({});
    }
  });

const writeStorage = (
  storage: chrome.storage.LocalStorageArea,
  values: Record<string, unknown>,
): Promise<void> =>
  new Promise((resolve) => {
    try {
      storage.set(values, () => resolve());
    } catch {
      resolve();
    }
  });

const currentUtcDay = (): string => new Date().toISOString().slice(0, 10);

const getVersion = (): string => {
  try {
    return chrome.runtime.getManifest().version || 'unknown';
  } catch {
    return 'unknown';
  }
};

const sendPing = async (day: string): Promise<boolean> => {
  try {
    await fetch(METRICS_ENDPOINT, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day, version: getVersion() }),
    });
    return true;
  } catch {
    // Offline or endpoint down. The ping is dropped rather than queued: a metric is never
    // worth accumulating data about the user on their device.
    return false;
  }
};

/**
 * Fires at most once per UTC day. Safe to call from any service-worker wake-up path — the
 * extra calls cost one storage read and return.
 */
export const recordDailyActivity = async (): Promise<void> => {
  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    const storage = getChromeStorage();
    if (!storage) return;

    const stored = await readStorage(storage, [LAST_PING_DAY_KEY, METRICS_ENABLED_KEY]);

    // No UI for this yet; the flag exists so an opt-out can be surfaced without touching
    // the ping logic. Absent value means enabled.
    if (stored[METRICS_ENABLED_KEY] === false) return;

    const today = currentUtcDay();
    if (stored[LAST_PING_DAY_KEY] === today) return;

    // Recorded before the request completes: a ping that fails is skipped for the day rather
    // than retried, which keeps a flapping endpoint from producing a burst of duplicates.
    await writeStorage(storage, { [LAST_PING_DAY_KEY]: today });
    await sendPing(today);
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
};
