/**
 * App-level configuration. Values can be overridden at build time with Vite
 * environment variables (e.g. `VITE_DEVFOUNDY_URL=https://… npm run build`).
 */
export const APP_NAME = 'Foundy Flashcards';
export const APP_VERSION = '1.0.0';
export const APP_TAGLINE = 'Learn smarter. Remember longer.';
export const DEVELOPER = 'DevFoundy';

/** DevFoundy website; the About page only shows the link when this is set. */
export const DEVFOUNDY_URL: string | null = (import.meta.env.VITE_DEVFOUNDY_URL as string | undefined)?.trim() || null;

/** Public source repository, if configured. */
export const SOURCE_URL: string | null = (import.meta.env.VITE_SOURCE_URL as string | undefined)?.trim() || null;
