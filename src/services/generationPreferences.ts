export type OnMode = 'smart' | 'always';

const IMAGE_ON_MODE_KEY = 'preferred_image_on_mode';
const AUDIO_ON_MODE_KEY = 'preferred_audio_on_mode';

// The create screen exposes image and audio as plain on/off chips. This is the other
// half of that choice: which of the two "on" behaviours the chip restores. It is a
// once-in-a-lifetime setting, so it lives on the Settings page rather than in the flow.
const read = (key: string): OnMode => {
    try {
        return localStorage.getItem(key) === 'always' ? 'always' : 'smart';
    } catch {
        return 'smart';
    }
};

const write = (key: string, mode: OnMode): void => {
    try {
        localStorage.setItem(key, mode);
    } catch {
        // Storage can be unavailable in restricted contexts; the default stays 'smart'.
    }
};

export const getPreferredImageOnMode = (): OnMode => read(IMAGE_ON_MODE_KEY);
export const setPreferredImageOnMode = (mode: OnMode): void => write(IMAGE_ON_MODE_KEY, mode);

export const getPreferredAudioOnMode = (): OnMode => read(AUDIO_ON_MODE_KEY);
export const setPreferredAudioOnMode = (mode: OnMode): void => write(AUDIO_ON_MODE_KEY, mode);
