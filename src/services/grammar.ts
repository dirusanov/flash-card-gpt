// Grammar facts are stored inside a card's `linguisticInfo` as a plain-text block —
// one "emoji label: value" line per fact. That format is:
//   • human-editable (no HTML to hand-edit),
//   • stable across languages (the model fills label/value, we own the layout),
//   • friendly to the Anki exporter, which already understands "label: value" lines.
//
// Older cards stored an HTML <div class="grammar-item"> blob instead. parseGrammar reads
// both, so nothing has to be migrated up front — a card is normalised the next time it is
// edited and re-serialised.

export interface GrammarFact {
    /** Leading emoji, e.g. "📚". May be empty. */
    emoji: string;
    /** Short label, e.g. "Part of speech". May be empty for a free-standing note. */
    label: string;
    /** The value/tag, e.g. "noun". */
    value: string;
}

// Matches a leading pictographic emoji (with optional variation selector / ZWJ sequence).
const LEADING_EMOJI = /^\s*((?:\p{Extended_Pictographic}(?:️)?(?:‍\p{Extended_Pictographic}(?:️)?)*)|[\u{1F1E6}-\u{1F1FF}]{2})\s*/u;

const stripEmoji = (raw: string): { emoji: string; rest: string } => {
    const match = raw.match(LEADING_EMOJI);
    if (!match) return { emoji: '', rest: raw.trim() };
    return { emoji: match[1], rest: raw.slice(match[0].length).trim() };
};

const factFromText = (line: string): GrammarFact | null => {
    const { emoji, rest } = stripEmoji(line.replace(/^[•\-*]\s*/, '').trim());
    if (!rest && !emoji) return null;

    const colon = rest.indexOf(':');
    if (colon === -1) {
        // A bare note with no label.
        return { emoji, label: '', value: rest };
    }
    const label = rest.slice(0, colon).trim();
    const value = rest.slice(colon + 1).trim();
    if (!label && !value) return null;
    return { emoji, label, value };
};

const parseHtml = (html: string): GrammarFact[] => {
    if (typeof DOMParser === 'undefined') return [];
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const items = Array.from(doc.querySelectorAll('.grammar-item'));
    if (items.length > 0) {
        return items
            .map((item): GrammarFact | null => {
                const iconEl = item.querySelector('[class^="icon-"], [class*=" icon-"]');
                const strongEl = item.querySelector('strong');
                const tagEl = item.querySelector('.grammar-tag, .grammar-value');

                const emoji = (iconEl?.textContent || '').trim();
                let label = (strongEl?.textContent || '').replace(/:\s*$/, '').trim();
                let value = (tagEl?.textContent || '').trim();

                if (!value) {
                    // Fall back to whatever text is left once icon + label are removed.
                    const full = (item.textContent || '').trim();
                    const withoutEmoji = emoji ? full.replace(emoji, '').trim() : full;
                    const withoutLabel = label ? withoutEmoji.replace(new RegExp(`^${label}:?\\s*`), '').trim() : withoutEmoji;
                    value = withoutLabel;
                }
                if (!emoji && !label && !value) return null;
                return { emoji, label, value };
            })
            .filter((f): f is GrammarFact => f !== null);
    }

    // Generic HTML with no known structure: flatten to text and parse line by line.
    const text = (doc.body.textContent || '').replace(/ /g, ' ');
    return text
        .split(/\n+/)
        .map(factFromText)
        .filter((f): f is GrammarFact => f !== null);
};

export const parseGrammar = (raw: string | null | undefined): GrammarFact[] => {
    const content = (raw || '').trim();
    if (!content) return [];

    if (/<[a-z][\s\S]*>/i.test(content)) {
        const facts = parseHtml(content);
        if (facts.length > 0) return facts;
    }

    return content
        .split(/\r?\n|<br\s*\/?>(?:\s*)/i)
        .map(factFromText)
        .filter((f): f is GrammarFact => f !== null);
};

export const serializeGrammar = (facts: GrammarFact[]): string =>
    facts
        .map((fact) => {
            const emoji = fact.emoji.trim();
            const label = fact.label.trim();
            const value = fact.value.trim();
            const labelled = label ? `${label}: ${value}` : value;
            return emoji ? `${emoji} ${labelled}` : labelled;
        })
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n');

export const isGrammarEmpty = (raw: string | null | undefined): boolean =>
    parseGrammar(raw).length === 0;
