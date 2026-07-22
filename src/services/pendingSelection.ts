/**
 * Hand-off point between the content script bootstrap and the React app.
 *
 * The context menu and the keyboard shortcut can fire before the app is mounted, or while the
 * user sits on a different screen, so the text is parked here rather than pushed. Subscribers
 * are only woken up — they read the value themselves, and whoever handles it clears it. That
 * keeps a single owner for the value and stops a stale selection from resurfacing the next
 * time the card screen mounts.
 *
 * Both sides live in the same bundle and isolated world, so a plain module holds the value
 * without touching globals or storage.
 */

type Listener = () => void;

let pendingText: string | null = null;
const listeners = new Set<Listener>();

export const setPendingSelection = (text: string): void => {
  const normalized = text.trim();
  if (!normalized) {
    return;
  }

  pendingText = normalized;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error('Pending selection listener failed:', error);
    }
  });
};

/** Returns the parked text once, then forgets it. */
export const consumePendingSelection = (): string | null => {
  const text = pendingText;
  pendingText = null;
  return text;
};

/** Notifies that text is waiting. Listeners must call `consumePendingSelection` to read it. */
export const subscribeToPendingSelection = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
