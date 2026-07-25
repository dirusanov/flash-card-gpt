/**
 * Palette shared with the Vaulto mobile apps. The canonical values and the reasoning
 * behind each role live in ../DESIGN_TOKENS.md; vaulto-cards and vaulto_note_mobile
 * express the same roles in src/theme/colors.ts. Change a value here only together
 * with those.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
    content: [
        "./src/**/*.{js,jsx,ts,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Every primary action and selected state. Matches `primary` in the mobile
                // theme — the extension used to be the odd one out on #2563EB.
                accent: {
                    DEFAULT: '#0066FF',
                    hover: '#0052CC',
                    // Opaque equivalents of the mobile primaryLight / selection overlays,
                    // because borders and fills here cannot rely on alpha compositing.
                    subtle: '#E0EDFF',
                    border: '#B3D1FF',
                },
                // Named surfaces, so panels stop picking a different grey each time
                // (#F9FAFB, #F3F4F6, #FAFAFA and #F8FAFC were all in use).
                surface: {
                    DEFAULT: '#FFFFFF',
                    muted: '#F8F9FA',
                    sunken: '#E9ECEF',
                },
                line: {
                    DEFAULT: '#DEE2E6',
                    strong: '#CED4DA',
                },
                // `strong` variants exist because the mobile brand values are tuned for
                // icons and fills; as text on a tinted background they fail WCAG AA.
                danger: {
                    DEFAULT: '#DC3545',
                    strong: '#A21B28',
                    subtle: '#FDF2F3',
                    border: '#F5C2C7',
                },
                warn: {
                    DEFAULT: '#F59E0B',
                    strong: '#8A5200',
                    subtle: '#FFF8E6',
                    border: '#FFE2A8',
                },
                ok: {
                    DEFAULT: '#10B981',
                    strong: '#07835C',
                    subtle: '#E7F8F1',
                    // Border for the mint "answer" surfaces (Grammar Reference box, example
                    // accents) — mirrors the mobile study card's green-tinted panels.
                    border: '#A7F3D0',
                },
                // Overrides Tailwind's own ramp so the dozens of existing text-gray-*,
                // border-gray-* and bg-gray-* classes resolve to the shared greys without
                // every component having to be rewritten.
                gray: {
                    50: '#F8F9FA',   // mobile: background
                    100: '#E9ECEF',  // mobile: backgroundSecondary
                    200: '#DEE2E6',  // mobile: border
                    300: '#CED4DA',  // mobile: borderHover / textMuted
                    400: '#ADB5BD',  // mobile: textTertiary
                    500: '#6C757D',  // mobile: textSecondary
                    600: '#495057',
                    700: '#343A40',
                    800: '#212529',
                    900: '#1A1A1A',  // mobile: text
                },
            },
            borderRadius: {
                // Three steps only: controls, cards, sheets.
                control: '6px',
                card: '10px',
                sheet: '16px',
            },
            boxShadow: {
                control: '0 1px 2px rgba(0, 0, 0, 0.04)',
                card: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
                sheet: '0 12px 32px -8px rgba(0, 0, 0, 0.18)',
            },
        },
    },
    plugins: [],
}
