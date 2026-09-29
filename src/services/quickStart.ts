import { Modes } from '../constants';
import { StoredCard } from '../store/reducers/cards';

// Imported only by extension pages, never by a content script.
const STATE_KEY = 'vaulto_quick_start_v2';
const INSTALL_KEY = 'vaulto_trial_installation_v1';
const REQUEST_KEY = 'vaulto_trial_request_v1';

export type QuickStep = 'compose' | 'result' | 'review' | 'done';

export interface QuickState {
    step: QuickStep;
    text: string;
    /** The sentence the text was selected from, and the page's declared language. */
    sentence: string;
    pageLanguage: string;
    /** The page the selection was made on; kept on the card as its source. */
    sourceUrl: string;
    sourceTitle: string;
    /** Explicit language of the text, or null while auto-detect is on. */
    source: string | null;
    /** What the server resolved the text's language to, when it built the draft. */
    detected: string | null;
    draft: StoredCard | null;
    saved: boolean;
}

const STEPS: QuickStep[] = ['compose', 'result', 'review', 'done'];

export const emptyQuickState = (): QuickState => ({
    step: 'compose', text: '', sentence: '', pageLanguage: '', sourceUrl: '', sourceTitle: '',
    source: null, detected: null, draft: null, saved: false,
});

const isDraft = (value: unknown): value is StoredCard =>
    Boolean(value) && typeof (value as StoredCard).id === 'string'
    && typeof (value as StoredCard).text === 'string';

export function loadQuickState(): QuickState {
    const base = emptyQuickState();
    try {
        const value = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
        if (!value || !STEPS.includes(value.step)) return base;
        const draft = isDraft(value.draft)
            ? { ...value.draft, createdAt: new Date(value.draft.createdAt) }
            : null;
        return {
            step: value.step !== 'compose' && !draft ? 'compose' : value.step,
            text: typeof value.text === 'string' ? value.text : '',
            sentence: typeof value.sentence === 'string' ? value.sentence : '',
            pageLanguage: typeof value.pageLanguage === 'string' ? value.pageLanguage : '',
            sourceUrl: typeof value.sourceUrl === 'string' ? value.sourceUrl : '',
            sourceTitle: typeof value.sourceTitle === 'string' ? value.sourceTitle : '',
            source: typeof value.source === 'string' ? value.source : null,
            detected: typeof value.detected === 'string' ? value.detected : null,
            draft,
            saved: Boolean(value.saved && draft),
        };
    } catch {
        return base;
    }
}

export function saveQuickState(state: QuickState): void {
    // Synchronous so closing the panel right after a response cannot lose the draft.
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function installationId(): string {
    let id = localStorage.getItem(INSTALL_KEY);
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(INSTALL_KEY, id);
    }
    return id;
}

export interface TrialStatus { available: boolean; remaining: number; limit: number; }

export class TrialError extends Error {
    /** `detail` names the server and what it answered, for the error strip and the console. */
    constructor(public code: string, public detail: string) {
        super(`${code}: ${detail}`);
        // The ES5 build drops the subclass prototype when extending Error; without this
        // `instanceof TrialError` is always false.
        Object.setPrototypeOf(this, TrialError.prototype);
        this.name = 'TrialError';
    }
}

// Two model passes plus a dictionary lookup; the server gives up at 75s.
const REQUEST_TIMEOUT_MS = 90000;

const hostOf = (baseUrl: string): string => {
    try { return new URL(baseUrl).host; } catch { return baseUrl || '(empty URL)'; }
};

// Every failure surfaces at once, with the server and the reason, and is logged: a trial that
// silently does nothing is worse than one that fails in the open.
async function trialFetch(baseUrl: string, path: string, init: RequestInit = {}): Promise<any> {
    const host = hostOf(baseUrl);
    const url = `${baseUrl.replace(/\/$/, '')}/trial/${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    console.info(`[Vaulto trial] ${init.method || 'GET'} ${url}`);
    let response: Response;
    try {
        response = await fetch(url, { ...init, credentials: 'omit', cache: 'no-store', signal: controller.signal });
    } catch (error) {
        const aborted = error instanceof DOMException && error.name === 'AbortError';
        const reason = aborted
            ? `no answer within ${REQUEST_TIMEOUT_MS / 1000}s`
            : (error instanceof Error ? error.message : String(error));
        console.warn(`[Vaulto trial] ${url} failed: ${reason}`);
        throw new TrialError('network', `${host}: ${reason}`);
    } finally {
        clearTimeout(timeout);
    }
    const raw = await response.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { /* not JSON: reported below */ }
    if (!response.ok || !data || typeof data !== 'object') {
        const code = data?.detail?.code || (response.status === 429 ? 'trial_busy' : 'http_error');
        const detail = `${host} answered ${response.status}${data?.detail?.code ? ` ${data.detail.code}` : ''}`;
        console.warn(`[Vaulto trial] ${url}: ${detail}`, raw.slice(0, 200));
        throw new TrialError(code, detail);
    }
    return data;
}

export async function getTrialStatus(baseUrl: string): Promise<TrialStatus> {
    const data = await trialFetch(baseUrl, `status?installation_id=${encodeURIComponent(installationId())}`);
    if (typeof data.available !== 'boolean' || !Number.isInteger(data.remaining) || !Number.isInteger(data.limit)) {
        throw new TrialError('bad_response', `${hostOf(baseUrl)} returned an unexpected status payload`);
    }
    return data;
}

export interface TrialResult {
    card: StoredCard;
    sourceLanguage: string;
    remaining: number;
}

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

export interface TrialRequest {
    text: string;
    /** Explicit language of the text, or null to let the server detect it. */
    source: string | null;
    target: string;
    sentence?: string;
    pageLanguage?: string;
}

const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Za-z]{2,8})?$/;

export async function createTrialCard(baseUrl: string, request: TrialRequest): Promise<TrialResult> {
    const sentence = (request.sentence || '').trim().slice(0, 600);
    const pageLanguage = (request.pageLanguage || '').trim();
    const input = {
        text: request.text.trim(),
        target_language: request.target,
        installation_id: installationId(),
        ...(request.source ? { source_language: request.source } : {}),
        ...(sentence && sentence !== request.text.trim() ? { context: sentence } : {}),
        ...(LANGUAGE_CODE.test(pageLanguage) ? { page_language: pageLanguage } : {}),
    };
    const fingerprint = JSON.stringify({ baseUrl, ...input });
    let pending: { fingerprint: string; id: string } | null = null;
    try { pending = JSON.parse(localStorage.getItem(REQUEST_KEY) || 'null'); } catch { /* new request */ }
    if (pending?.fingerprint !== fingerprint) {
        pending = { fingerprint, id: crypto.randomUUID() };
        localStorage.setItem(REQUEST_KEY, JSON.stringify(pending));
    }
    try {
        const data = await trialFetch(baseUrl, 'cards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...input, request_id: pending!.id }),
        });
        const card = data.card || {};
        const examples: Array<[string, string]> = Array.isArray(card.examples)
            ? card.examples
                .filter((e: any) => e && isText(e.text) && isText(e.translation))
                .map((e: any) => [e.text, e.translation] as [string, string])
            : [];
        if (![card.translation, card.source_language].every(isText) || examples.length === 0
            || !Number.isInteger(data.remaining)) {
            console.warn('[Vaulto trial] incomplete card payload', data);
            throw new TrialError('bad_response', `${hostOf(baseUrl)} returned an incomplete card`);
        }
        return {
            card: {
                id: crypto.randomUUID(),
                mode: Modes.LanguageLearning,
                text: input.text,
                front: input.text,
                translation: card.translation,
                transcription: isText(card.transcription) ? card.transcription : '',
                linguisticInfo: isText(card.grammar_note) ? card.grammar_note : '',
                wordAudio: isText(card.word_audio) && card.word_audio.startsWith('data:audio') ? card.word_audio : null,
                examples,
                examplesAudio: examples.map(() => null),
                createdAt: new Date(),
                exportStatus: 'not_exported',
            },
            sourceLanguage: card.source_language,
            remaining: data.remaining,
        };
    } catch (error) {
        // A timeout may have completed on the server. Keep the id until a definite
        // failure comes back, so Retry never spends a second credit on a lost response.
        if (error instanceof TrialError && ['generation_failed', 'request_conflict', 'bad_response'].includes(error.code)) {
            localStorage.removeItem(REQUEST_KEY);
        }
        throw error;
    }
}

export const trialErrorMessage = (error: unknown): string => {
    if (!(error instanceof TrialError)) {
        return `Card creation failed before any request was sent: ${error instanceof Error ? error.message : String(error)}`;
    }
    switch (error.code) {
        case 'trial_exhausted':
            return 'Your free cards are used up. Add your own OpenAI key in Settings to keep creating.';
        case 'trial_busy':
            return `Free card creation is busy right now (${error.detail}). Please try again a little later.`;
        case 'request_pending':
            return 'Your card is still being built. Press Create again in a moment to pick it up.';
        case 'generation_failed':
            return `Could not build a card for this text (${error.detail}). Try another word or phrase.`;
        case 'trial_unavailable':
            return `Free card creation is switched off on the server (${error.detail}).`;
        default:
            return `Could not get a card from Vaulto (${error.detail}). Your text is kept.`;
    }
};

/** Voice for one example sentence; counted under the trial's own speech quota, not cards. */
export async function createTrialAudio(baseUrl: string, text: string): Promise<string> {
    const data = await trialFetch(baseUrl, 'audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installation_id: installationId(), text: text.trim().slice(0, 300) }),
    });
    if (!isText(data.audio) || !data.audio.startsWith('data:audio')) {
        throw new TrialError('bad_response', `${hostOf(baseUrl)} returned no audio`);
    }
    return data.audio;
}
