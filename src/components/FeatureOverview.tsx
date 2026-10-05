import React, { useState } from 'react';
import { FaImage, FaVolumeUp, FaLayerGroup, FaChevronRight } from 'react-icons/fa';
import Modal from './ui/Modal';

interface Props {
    hasOwnKey: boolean;
    signedIn: boolean;
    disabled: boolean;
    onNavigate: (page: string) => void;
}

/** Available to every user, including before their first card or API-key setup. */
const FeatureOverview: React.FC<Props> = ({ hasOwnKey, signedIn, disabled, onNavigate }) => {
    const [open, setOpen] = useState(false);
    const go = (page: string) => { setOpen(false); onNavigate(page); };
    const features = [
        { title: 'Translation, examples & grammar', status: hasOwnKey ? 'Your API key' : 'Free allowance',
            description: 'Select a word on a page, press Alt+C or use the context menu. Get its meaning, pronunciation, examples and grammar in your chosen language.',
            action: 'Create a card', page: 'createCard' },
        { title: 'Images', status: hasOwnKey ? 'Your API key' : 'Free allowance',
            description: 'Add a visual memory cue. Free images depend on server availability. With your key, Image → Smart skips abstract words; choose Every card to request an image each time.',
            action: hasOwnKey ? 'Choose Image mode' : 'Try a free card', page: 'createCard' },
        { title: 'Audio', status: hasOwnKey ? 'Your API key' : 'Free allowance',
            description: 'Listen to the word and example sentences using the speaker buttons. With your key, choose Smart, Every card or Off.',
            action: 'Create a card', page: 'createCard' },
        { title: 'Edit & organise', status: 'Available now',
            description: 'Check a draft before saving, edit saved cards and organise them into decks. Advanced generation can recreate individual parts with your own key.',
            action: 'Open your cards', page: 'storedCards' },
        { title: 'Spaced repetition', status: 'Available now',
            description: 'Study in the browser and rate each answer. Cards return when due; the Cards tab shows how many are ready. Saved cards can be reviewed offline.',
            action: 'Open your cards', page: 'storedCards' },
        { title: 'Export to Anki', status: 'Requires Anki Desktop + AnkiConnect',
            description: 'Send cards, images and audio to Anki. Enable AnkiConnect in Settings and keep Anki Desktop running, then export from Cards.',
            action: 'Set up Anki', page: 'settings' },
        { title: 'Sync across devices', status: signedIn ? 'Signed in' : 'Requires a Vaulto account',
            description: 'Sign in to back up your cards and study them on other devices. You can create, save and review locally without an account.',
            action: signedIn ? 'Open your account' : 'Sign in', page: 'auth' },
        { title: 'Advanced AI controls', status: hasOwnKey ? 'Available with your key' : 'Requires your OpenAI API key',
            description: 'Choose image style and generation modes, customise instructions and regenerate card parts. Provider usage is billed to your own key.',
            action: 'Open settings', page: 'settings' },
    ];
    return (
        <div className="shrink-0 border-b border-line bg-white px-3 pb-2">
            <button type="button" disabled={disabled} onClick={() => setOpen(true)}
                aria-haspopup="dialog" aria-expanded={open}
                className="flex w-full items-center gap-2 rounded-control px-2 py-2 text-left text-xs text-gray-600 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">
                <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-accent">All features</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
                        <FaImage aria-hidden="true" /> Images · <FaVolumeUp aria-hidden="true" /> Audio · <FaLayerGroup aria-hidden="true" /> Review · Anki · Sync
                    </span>
                </span>
                <FaChevronRight aria-hidden="true" size={9} />
            </button>
            <Modal open={open} onClose={() => setOpen(false)} title="What you can do with Vaulto"
                subtitle="Explore each feature and see what it needs.">
                <div className="divide-y divide-line px-4">
                    {features.map((feature) => (
                        <section key={feature.title} className="py-3">
                            <h3 className="m-0 text-sm font-semibold text-gray-900">{feature.title}</h3>
                            <p className="m-0 mt-1 text-[11px] font-medium text-accent">{feature.status}</p>
                            <p className="m-0 mt-1 text-xs leading-relaxed text-gray-600">{feature.description}</p>
                            <button type="button" onClick={() => go(feature.page)}
                                className="mt-2 rounded-control border border-line px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                                {feature.action}
                            </button>
                        </section>
                    ))}
                </div>
            </Modal>
        </div>
    );
};

export default FeatureOverview;
