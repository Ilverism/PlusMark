export type BadgeTheme = 'light' | 'dark' | 'soft-dark';

// GitHub's reaction-button colors. Keep these independent of the generator's theme.
export const BADGE_THEMES = {
	light: { background: '#f6f8fa', border: '#d1d9e0', text: '#25292e', muted: '#59636e' },
	dark: { background: '#212830', border: '#3d444d', text: '#f0f6fc', muted: '#9198a1' },
	'soft-dark': { background: '#2a313c', border: '#3d444d', text: '#d1d7e0', muted: '#9198a1' }
} satisfies Record<BadgeTheme, { background: string; border: string; text: string; muted: string }>;

export function isBadgeTheme(value: unknown): value is BadgeTheme {
	return value === 'light' || value === 'dark' || value === 'soft-dark';
}

export function badgePalette(theme: unknown) {
	return BADGE_THEMES[isBadgeTheme(theme) ? theme : 'light'];
}
