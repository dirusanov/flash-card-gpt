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

// The page's declared language. Read here, in the page, because the panel's own document
// is an extension page and its <html lang> says nothing about the site.
const readPageLanguage = () => {
  try {
    const raw =
      document.documentElement.getAttribute('lang') ||
      document.querySelector('meta[http-equiv="Content-Language" i]')?.content ||
      document.querySelector('meta[property="og:locale" i]')?.content ||
      '';
    const code = raw.trim().toLowerCase().split(/[-_]/)[0];
    return /^[a-z]{2,3}$/.test(code) ? code : '';
  } catch {
    return '';
  }
};

const SENTENCE_MAX = 300;

// Where the selection actually starts inside the block's normalised text. indexOf() would
// find the *first* copy of the word, so a paragraph mentioning "bank" twice — once
// financial, once riverside — always handed over the first sentence no matter which one
// the user highlighted. Walking the range gives the real offset; indexOf stays as the
// fallback for the cases a range cannot answer.
const locateSelection = (block, range, blockText, needle) => {
  try {
    const prefix = document.createRange();
    prefix.selectNodeContents(block);
    prefix.setEnd(range.startContainer, range.startOffset);
    const at = prefix.toString().replace(/\s+/g, ' ').replace(/^ /, '').length;
    // The range may open on whitespace that the trimmed selection dropped; allow a
    // character or two of slack before giving up on it.
    for (let delta = 0; delta <= 2; delta += 1) {
      if (blockText.slice(at + delta, at + delta + needle.length) === needle) {
        return at + delta;
      }
    }
  } catch {
    // Detached node, cross-root range: fall through to the scan.
  }
  return blockText.indexOf(needle);
};

// The sentence the selection sits in: the surrounding block's text, cut at the nearest
// sentence boundaries around the selection. A single word without its sentence is often
// ambiguous ("ging", "dormir"); with the sentence it is not.
const readSelectionSentence = (selected) => {
  try {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selected) {
      return '';
    }
    const range = selection.getRangeAt(0);
    let node = range.commonAncestorContainer;
    if (node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement;
    while (node && node !== document.body) {
      const display = getComputedStyle(node).display;
      if (display === 'block' || display === 'list-item' || display === 'table-cell' || /^(P|LI|TD|DIV|ARTICLE|SECTION|H[1-6]|BLOCKQUOTE|DD|DT)$/.test(node.tagName)) {
        break;
      }
      node = node.parentElement;
    }
    if (!node) {
      return '';
    }
    const block = (node.textContent || '').replace(/\s+/g, ' ').trim();
    // The block collapsed its whitespace; a selection spanning a line break has to be
    // collapsed the same way or it will not match.
    const needle = selected.replace(/\s+/g, ' ');
    const at = locateSelection(node, range, block, needle);
    if (at === -1 || block.length <= needle.length) {
      return '';
    }
    // A trailing space is what keeps "3.14" and "e.g." from reading as sentence ends, but
    // Chinese and Japanese put no space after 。！？ — demanding one there matched nothing
    // and handed over the whole paragraph. Full-width stops are unambiguous on their own.
    const boundary = /[.!?]\s|[。！？]/g;
    let start = 0;
    let end = block.length;
    let match;
    while ((match = boundary.exec(block)) !== null) {
      const cut = match.index + match[0].length;
      if (cut <= at) start = cut;
      else if (match.index >= at + needle.length) { end = match.index + 1; break; }
    }
    let sentence = block.slice(start, end).trim();
    if (sentence.length > SENTENCE_MAX) {
      const from = Math.max(0, at - start - Math.floor(SENTENCE_MAX / 2));
      sentence = sentence.slice(from, from + SENTENCE_MAX).trim();
    }
    return sentence === needle ? '' : sentence;
  } catch {
    return '';
  }
};

// Where the word was met. Stored with the card, so the sentence keeps its provenance and
// the user can get back to the page from the card.
const readPageSource = () => {
  try {
    const url = location.href;
    if (!/^https?:/.test(url)) return { sourceUrl: '', sourceTitle: '' };
    return { sourceUrl: url.slice(0, 2000), sourceTitle: (document.title || '').trim().slice(0, 200) };
  } catch {
    return { sourceUrl: '', sourceTitle: '' };
  }
};

const readSelectionDetails = () => {
  const text = readSelection();
  return {
    text,
    sentence: readSelectionSentence(text),
    pageLanguage: readPageLanguage(),
    ...readPageSource(),
  };
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) {
    return undefined;
  }

  if (message.action === GET_PAGE_SELECTION) {
    sendResponse({ ok: true, ...readSelectionDetails() });
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

// Keyed on what we would actually send, not on the word alone. Selecting "bank" in a
// sentence about money and then "bank" in one about a river is two different cards, and
// comparing the text by itself swallowed the second one — the panel kept the first
// sentence and the server, which reads meaning from that sentence, never saw the change.
const selectionKey = ({ text, sentence }) => `${text}\u0000${sentence}`;

const notifySelection = () => {
  const details = readSelectionDetails();
  const { text } = details;
  if (!text || selectionKey(details) === lastSentSelection) {
    return;
  }

  lastSentSelection = selectionKey(details);
  try {
    chrome.runtime.sendMessage({ action: SELECTION_CHANGED, ...details }, () => {
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
