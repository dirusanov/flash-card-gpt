/**
 * Removes the per-site card image database that older versions created.
 *
 * Because it was opened from a content script, `vaulto-card-images` belonged to whatever
 * website the panel was open on rather than to the extension. Images are now kept in the
 * extension's own storage, which leaves those databases behind on every origin the user ever
 * opened the panel on — potentially megabytes of base64 under the site's quota, where nobody
 * would think to look for them.
 *
 * The contents are deliberately not rescued: images were only ever visible on the origin that
 * created them, and carrying that scoping forward is not worth the code.
 *
 * Runs on every page load, so the fast path matters — `databases()` answers without opening
 * anything, and on almost every origin there is nothing to delete.
 */

const LEGACY_DB_NAME = 'vaulto-card-images';

const legacyDatabaseExists = async (): Promise<boolean> => {
  try {
    if (typeof indexedDB === 'undefined') {
      return false;
    }

    // Not universally available; when it is missing, deleteDatabase on an absent database is
    // a harmless no-op, so fall through rather than skip the cleanup entirely.
    if (typeof indexedDB.databases !== 'function') {
      return true;
    }

    const databases = await indexedDB.databases();
    return databases.some((entry) => entry?.name === LEGACY_DB_NAME);
  } catch {
    return false;
  }
};

export const deleteLegacyCardImageDatabase = async (): Promise<void> => {
  if (!(await legacyDatabaseExists())) {
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(LEGACY_DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      // Another tab still holds the database open; the next page load will retry.
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
};
