import { AIService } from './aiServiceFactory';

// What a free-form instruction can ask the card editor to do. The model picks from these
// rather than the app matching keywords: "нарисуй акварелью", "make it shorter" and
// "добавь озвучку" all have to work without anyone having listed those words anywhere.
export type CardAction = 'image' | 'examples' | 'translation' | 'audio' | 'grammar' | 'rebuild';

const ALL_ACTIONS: CardAction[] = ['image', 'examples', 'translation', 'audio', 'grammar', 'rebuild'];

export interface InstructionPlan {
    /** Actions to run, in the order the model returned them. Never empty. */
    actions: CardAction[];
    /** The instruction rewritten as guidance for the generators, in the user's words. */
    detail: string;
}

const SYSTEM_PROMPT = `You route a flashcard editing request to the tools that can fulfil it.

Tools:
- image: draw or redraw the card's picture (style, subject, format of the picture)
- examples: write example sentences (count, tone, difficulty, topic)
- translation: change the translation/meaning of the card
- audio: generate spoken pronunciation for the word and examples
- grammar: refresh the grammar reference (part of speech, gender, forms)
- rebuild: regenerate the whole card when the request is broad ("make it simpler", "improve it")

Rules:
- Reply with JSON only: {"actions":["..."],"detail":"..."}
- "actions" holds one or more tool names from the list, ordered by what to do first.
- Use "rebuild" alone when the request is general rather than about one part.
- "detail" restates the request as instructions for the tools, in the request's own language.
- Never invent tool names.`;

const extractJson = (raw: string): any | null => {
    const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try {
        return JSON.parse(trimmed);
    } catch {
        // Models sometimes wrap the object in prose; take the outermost braces.
        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}');
        if (start === -1 || end <= start) return null;
        try {
            return JSON.parse(trimmed.slice(start, end + 1));
        } catch {
            return null;
        }
    }
};

/**
 * Asks the model which parts of a card an instruction is about.
 *
 * Falls back to a whole-card rebuild — never to keyword guessing — because a rebuild
 * honours any instruction, just less cheaply than a targeted one.
 */
export const planInstruction = async (
    aiService: AIService,
    apiKey: string,
    instruction: string,
    context?: { word?: string; hasImage?: boolean; language?: string }
): Promise<InstructionPlan> => {
    const fallback: InstructionPlan = { actions: ['rebuild'], detail: instruction };
    if (!apiKey) return fallback;

    try {
        const contextLine = context
            ? `Card: word="${context.word || ''}", hasPicture=${Boolean(context.hasImage)}, studyLanguage="${context.language || ''}".`
            : '';

        const response = await aiService.createChatCompletion(apiKey, [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `${contextLine}\nRequest: ${instruction}` },
        ]);

        const parsed = response?.content ? extractJson(response.content) : null;
        if (!parsed) return fallback;

        const actions = (Array.isArray(parsed.actions) ? parsed.actions : [])
            .filter((action: unknown): action is CardAction =>
                typeof action === 'string' && ALL_ACTIONS.includes(action as CardAction))
            // A model that lists everything alongside "rebuild" still means "rebuild".
            .filter((action: CardAction, _i: number, list: CardAction[]) =>
                action === 'rebuild' || !list.includes('rebuild'));

        if (actions.length === 0) return fallback;

        const detail = typeof parsed.detail === 'string' && parsed.detail.trim()
            ? parsed.detail.trim()
            : instruction;

        return { actions: Array.from(new Set(actions)), detail };
    } catch (error) {
        console.warn('Instruction routing failed, rebuilding the whole card instead:', error);
        return fallback;
    }
};

// Human-readable progress for each step, so the composer can say what is happening.
export const ACTION_STATUS: Record<CardAction, string> = {
    image: 'Drawing a new picture…',
    examples: 'Writing new examples…',
    translation: 'Updating the translation…',
    audio: 'Recording the audio…',
    grammar: 'Refreshing the grammar…',
    rebuild: 'Rebuilding the card…',
};
