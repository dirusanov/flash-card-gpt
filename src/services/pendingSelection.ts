/**
 * Hand-off of a selection from background to the side panel.
 *
 * The two now live in separate documents, so a shared module variable no longer reaches both.
 * The text is parked in extension storage instead, which also solves the timing problem: the
 * context menu and the shortcut open the panel, and the panel takes a moment to boot, so the
 * value has to survive until something is there to read it.
 *
 * Whoever handles the text clears it, keeping a single owner and stopping a stale selection
 * from resurfacing the next time the card screen mounts.
 */

const PENDING_KEY = 'vaulto_pending_selection';

type PendingSelection = {
  tabId: number;
  text: string;
};

const getChromeStorage = () => {
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      return chrome.storage.local;
    }
  } catch {
    // No storage: the hand-off simply does not happen.
  }
  return null;
};

export const setPendingSelection = (tabId: number, text: string): Promise<void> =>
  new Promise((resolve) => {
    const normalized = text.trim();
    const storage = getChromeStorage();
    if (!storage || !normalized) {
      resolve();
      return;
    }

    try {
      storage.set({ [PENDING_KEY]: { tabId, text: normalized } as PendingSelection }, () => resolve());
    } catch {
      resolve();
    }
  });

/** Returns the parked text for this tab once, then forgets it. */
export const consumePendingSelection = (tabId: number): Promise<string | null> =>
  new Promise((resolve) => {
    const storage = getChromeStorage();
    if (!storage) {
      resolve(null);
      return;
    }

    try {
      storage.get([PENDING_KEY], (items) => {
        const pending = items?.[PENDING_KEY] as PendingSelection | undefined;
        if (!pending?.text || pending.tabId !== tabId) {
          resolve(null);
          return;
        }

        storage.remove([PENDING_KEY], () => resolve(pending.text));
      });
    } catch {
      resolve(null);
    }
  });

/** Fires when text is parked. Listeners must call `consumePendingSelection` to read it. */
export const subscribeToPendingSelection = (listener: () => void): (() => void) => {
  const onChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local' || !changes[PENDING_KEY]?.newValue) {
      return;
    }
    listener();
  };

  try {
    chrome.storage.onChanged.addListener(onChanged);
  } catch {
    return () => undefined;
  }

  return () => {
    try {
      chrome.storage.onChanged.removeListener(onChanged);
    } catch {
      // Extension context is gone; nothing to detach from.
    }
  };
};
