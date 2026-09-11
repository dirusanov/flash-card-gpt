/**
 * Panel-side access to the page.
 *
 * The side panel is an extension page: it has no `document` of the tab and cannot read the
 * article the user is looking at. The content script does that and answers over messaging,
 * which works because `PageContentContext` is plain serializable data.
 *
 * Every call can legitimately come back empty — the tab may be a chrome:// page, the content
 * script may not have loaded yet, or the tab may have navigated. Callers get `null` and are
 * expected to carry on without page context rather than fail the card.
 */

import type { PageContentContext } from './aiAgentService';

export const EXTRACT_PAGE_CONTEXT = 'vaulto:extractPageContext';
export const GET_PAGE_SELECTION = 'vaulto:getPageSelection';
export const SELECTION_CHANGED = 'vaulto:selectionChanged';

const REQUEST_TIMEOUT_MS = 5_000;

const sendToTab = <T>(tabId: number, message: unknown): Promise<T | null> =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (value: T | null) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    // A content script that never answers must not hang card creation.
    const timer = setTimeout(() => finish(null), REQUEST_TIMEOUT_MS);

    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          finish(null);
          return;
        }
        finish((response as T) ?? null);
      });
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });

export const getActiveTabId = (): Promise<number | null> =>
  new Promise((resolve) => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs?.[0];
        resolve(tab?.id ?? null);
      });
    } catch {
      resolve(null);
    }
  });

export const requestPageContext = async (
  tabId: number | null,
  selectedText: string,
): Promise<PageContentContext | null> => {
  if (tabId == null) {
    return null;
  }

  const response = await sendToTab<{ ok: boolean; context: PageContentContext | null }>(tabId, {
    action: EXTRACT_PAGE_CONTEXT,
    selectedText,
  });

  return response?.ok ? response.context : null;
};

/** What the content script reports about the current selection, as one message. */
export interface PageSelectionDetails {
  text: string;
  /** The sentence the text sits in — empty when the selection is the whole block. */
  sentence: string;
  /** The page's declared language code, or empty. */
  pageLanguage: string;
  /** Where the selection was made. Empty on pages that are not http(s). */
  sourceUrl: string;
  sourceTitle: string;
}

const asString = (value: unknown) => (typeof value === 'string' ? value : '');

export const requestPageSelection = async (
  tabId: number | null,
): Promise<PageSelectionDetails | null> => {
  if (tabId == null) {
    return null;
  }

  const response = await sendToTab<{ ok: boolean } & Partial<PageSelectionDetails>>(tabId, {
    action: GET_PAGE_SELECTION,
  });
  if (!response?.ok || typeof response.text !== 'string') {
    return null;
  }

  return {
    text: response.text,
    sentence: asString(response.sentence),
    pageLanguage: asString(response.pageLanguage),
    sourceUrl: asString(response.sourceUrl),
    sourceTitle: asString(response.sourceTitle),
  };
};
