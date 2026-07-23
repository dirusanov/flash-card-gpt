/**
 * Page-side bridge for the side panel.
 *
 * The UI itself now lives in the side panel, which is an extension page and cannot touch the
 * tab's DOM. Everything that genuinely requires the page stays here: reading the selection,
 * extracting page context, and telling the panel when the user selects something new.
 *
 * Keeping this script small is the point — it runs on every page the user opens.
 */

import { migrateAndPurgeLegacyLocalStorage } from '../../services/legacyLocalStorageCleanup';
import { deleteLegacyCardImageDatabase } from '../../services/legacyCardImageCleanup';
import {
  EXTRACT_PAGE_CONTEXT,
  GET_PAGE_SELECTION,
  SELECTION_CHANGED,
} from '../../services/pageContextBridge';
// Imported statically on purpose: a dynamic import would emit a separate chunk, and webpack
// would ask the visited site for it rather than the extension. It is a few kilobytes.
import { PageContentExtractor } from '../../services/pageContentExtractor';

const SELECTION_DEBOUNCE_MS = 150;

const readSelection = () => {
  try {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return '';
    }
    return selection.toString().trim();
  } catch {
    return '';
  }
};

// The element the selection sits in, used to score how relevant nearby images and formulas are.
const readSelectionElement = () => {
  try {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return undefined;
    }

    const container = selection.getRangeAt(0).commonAncestorContainer;
    return container.nodeType === Node.ELEMENT_NODE
      ? container
      : container.parentElement ?? undefined;
  } catch {
    return undefined;
  }
};

const extractPageContext = async (selectedText) =>
  PageContentExtractor.extractPageContentAsync(selectedText, readSelectionElement());

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) {
    return undefined;
  }

  if (message.action === GET_PAGE_SELECTION) {
    sendResponse({ ok: true, text: readSelection() });
    return true;
  }

  if (message.action === EXTRACT_PAGE_CONTEXT) {
    extractPageContext(message.selectedText || '')
      .then((context) => sendResponse({ ok: true, context }))
      .catch((error) => {
        console.error('Failed to extract page context:', error);
        sendResponse({ ok: false, context: null });
      });
    return true;
  }

  return undefined;
});

// Mirrors the old in-page behaviour: selecting text on the page fills the panel's text field.
// The panel decides whether to accept it, so an unrelated selection cannot silently overwrite
// work in progress.
let selectionTimer = null;
let lastSentSelection = '';

const notifySelection = () => {
  const text = readSelection();
  if (!text || text === lastSentSelection) {
    return;
  }

  lastSentSelection = text;
  try {
    chrome.runtime.sendMessage({ action: SELECTION_CHANGED, text }, () => {
      // The panel is usually closed; swallowing the "no receiver" error is the normal path.
      void chrome.runtime.lastError;
    });
  } catch {
    // Extension context went away, e.g. after an update. Nothing to do from here.
  }
};

document.addEventListener('mouseup', () => {
  if (selectionTimer !== null) {
    clearTimeout(selectionTimer);
  }
  selectionTimer = setTimeout(notifySelection, SELECTION_DEBOUNCE_MS);
});

// Removes credentials and card images that older versions wrote into the storage of every site
// the user visited. Both check cheaply and do nothing on almost every page.
void migrateAndPurgeLegacyLocalStorage().catch((error) => {
  console.error('Failed to purge legacy localStorage mirrors:', error);
});

void deleteLegacyCardImageDatabase().catch((error) => {
  console.error('Failed to delete legacy card image database:', error);
});
