export type WidgetReactionInput = {
	id: string;
	emoji: string;
	label: string;
	description: string;
};

export type PublicWidgetReaction = WidgetReactionInput & {
	count: number;
};

export type PublicWidget = {
	doc: string;
	returnUrl: string;
	verifyReferrer: boolean;
	reactions: PublicWidgetReaction[];
	createdAt: number;
	updatedAt: number;
};

export type WidgetDraftReaction = {
	emoji: string;
	name: string;
	description: string;
};

export type WidgetDraft = {
	doc: string;
	returnUrl: string;
	reactions: WidgetDraftReaction[];
};

export const MAX_DOC_ID_LENGTH = 120;
export const MAX_REACTION_ID_LENGTH = 80;
export const MAX_LABEL_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 240;
export const MAX_RETURN_URL_LENGTH = 2048;
export const MAX_REACTIONS = 24;
export const MAX_GROUP_ID_LENGTH = 32;

export function createReactionGroupId(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function buildGroupContentId(contentId: string, groupId: string): string | null {
	const doc = normalizeDocId(contentId);
	const group = groupId.trim().toLowerCase();
	if (!doc) return null;
	if (!group) return doc;
	if (group.length > MAX_GROUP_ID_LENGTH || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(group)) return null;
	const combined = `${doc}-g-${group}`;
	// Never silently truncate a group into another group's identity.
	return combined.length <= MAX_DOC_ID_LENGTH ? combined : null;
}

export function slugifyContentId(input: string): string {
	return slugify(input, MAX_DOC_ID_LENGTH);
}

export function slugifyReactionId(input: string): string {
	return slugify(input, MAX_REACTION_ID_LENGTH);
}

export function normalizeDocId(input: string): string | null {
	const normalized = slugifyContentId(input);
	return normalized.length > 0 ? normalized : null;
}

export function normalizeReactionId(input: string): string | null {
	const normalized = slugifyReactionId(input);
	return normalized.length > 0 ? normalized : null;
}

export function normalizeReturnUrl(input: string): string | null {
	const value = input.trim();
	if (!value || value.length > MAX_RETURN_URL_LENGTH) return null;

	try {
		const url = new URL(value);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		return url.toString();
	} catch {
		return null;
	}
}

export function createWidgetInput(draft: WidgetDraft): {
	doc: string;
	returnUrl: string;
	reactions: WidgetReactionInput[];
} | null {
	const returnUrl = normalizeReturnUrl(draft.returnUrl);
	const doc = normalizeDocId(draft.doc);

	if (!doc || !returnUrl || draft.reactions.some(reaction => !reaction.name.trim())) return null;

	const usedIds = new Map<string, number>();
	const reactions = draft.reactions
		.map((reaction) => {
			const label = reaction.name.trim().slice(0, MAX_LABEL_LENGTH);
			const baseId = slugifyReactionId(label || reaction.emoji) || 'reaction';
			const nextCount = (usedIds.get(baseId) ?? 0) + 1;
			usedIds.set(baseId, nextCount);

			const suffix = nextCount > 1 ? `-${nextCount}` : '';
			const id = `${baseId.slice(0, MAX_REACTION_ID_LENGTH - suffix.length)}${suffix}`;

			return {
				id,
				emoji: reaction.emoji.trim() || '👍',
				label,
				description: reaction.description.trim().slice(0, MAX_DESCRIPTION_LENGTH)
			};
		})
		.slice(0, MAX_REACTIONS);

	if (reactions.length === 0) return null;

	return {
		doc,
		returnUrl,
		reactions
	};
}

export type MarkdownFormatting = 'row' | 'table-no-desc' | 'table-with-desc';

export function buildMarkdownSnippet(widget: Pick<PublicWidget, 'doc' | 'returnUrl'> & {
	reactions: WidgetReactionInput[];
}, origin: string, includePlusMarkBadge = true, includeSourceBadge = false, formatting: MarkdownFormatting = 'row'): string {
	const baseUrl = origin.replace(/\/$/, '');

	const badges = widget.reactions
		.map((reaction) => {
			const doc = encodeURIComponent(widget.doc);
			const reactionId = encodeURIComponent(reaction.id);
			const label = escapeMarkdownAlt(reaction.label);
			const badgeUrl = `${baseUrl}/badge?doc=${doc}&r=${reactionId}`;
			const reactUrl = `${baseUrl}/react?doc=${doc}&r=${reactionId}`;

			return `[![${reaction.emoji} ${label}](${badgeUrl})](${reactUrl})`;
		})
		.concat(includeSourceBadge
			? [`[![Source: ${escapeMarkdownAlt(widget.returnUrl)}](${baseUrl}/source-badge?doc=${encodeURIComponent(widget.doc)})](<${widget.returnUrl.replace(/</g, '%3C').replace(/>/g, '%3E')}>)`]
			: [])
		.concat(includePlusMarkBadge
			? [`[![PlusMark](${baseUrl}/PlusMark-badge.svg)](https://plusmark.ilverism.workers.dev/)`]
			: []);
	if (formatting === 'row') return badges.join(' ');

	const headings = widget.reactions.map(reaction => escapeTableText(reaction.label));
	const descriptions = widget.reactions.map(reaction => escapeTableText(reaction.description));
	if (includeSourceBadge) { headings.push('Source'); descriptions.push(''); }
	if (includePlusMarkBadge) { headings.push('PlusMark'); descriptions.push(''); }
	const tableRow = (cells: string[]) => `| ${cells.join(' | ')} |`;
	const rows = [
		tableRow(headings),
		tableRow(badges.map(() => ':---:')),
		tableRow(badges.map(badge => badge.replace(/\|/g, '&#124;').replace(/\r\n?|\n/g, ' ')))
	];
	if (formatting === 'table-with-desc') rows.push(tableRow(descriptions));
	return rows.join('\n');
}

function escapeTableText(input: string): string {
	return input.replace(/[&<>\\`*_[\]{}|~]/g, char => `&#${char.charCodeAt(0)};`).replace(/\r\n?|\n/g, '<br>');
}

function slugify(input: string, maxLength: number): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, '')
		.replace(/^www\./, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, maxLength)
		.replace(/-+$/g, '');
}

function escapeMarkdownAlt(input: string): string {
	return input.replace(/[[\]\\]/g, '\\$&');
}
