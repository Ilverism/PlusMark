import { error, json, type RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { isReactionSourceAllowed, reactionSourceFailure } from './reaction-source';
import type { ReactionDocument } from './reaction-document';
import { advanceBadgePublication, badgeRefreshAt, type BadgePublication } from './badge-throttle';
import {
	MAX_DESCRIPTION_LENGTH,
	MAX_LABEL_LENGTH,
	MAX_REACTIONS,
	normalizeDocId,
	normalizeReactionId,
	normalizeReturnUrl,
	type PublicWidget,
	type WidgetReactionInput
} from '$lib/widget';

export type ReactionDocumentStub = Pick<
	ReactionDocument,
	'saveWidget' | 'getWidget' | 'getBadge' | 'toggleReaction'
>;

type WidgetPayload = {
	doc: string;
	returnUrl: string;
	verifyReferrer?: boolean;
	reactions: WidgetReactionInput[];
	editToken: string | null;
};

type JsonFailure = ReturnType<typeof json>;

const TOKEN_BYTES = 32;
const VISITOR_COOKIE = 'pm_vid';
const VISITOR_MAX_AGE = 60 * 60 * 24 * 400;
const devReactionDocuments = new Map<string, DevReactionDocument>();

export function getReactionDocumentStub(event: RequestEvent, doc: string): Promise<ReactionDocumentStub> {
	if (dev) {
		let document = devReactionDocuments.get(doc);

		if (!document) {
			document = new DevReactionDocument(doc);
			devReactionDocuments.set(doc, document);
		}

		return Promise.resolve(document);
	}

	const env = event.platform?.env;
	const namespace = env?.REACTION_DOCUMENTS;

	if (!namespace) {
		error(500, 'The REACTION_DOCUMENTS Durable Object binding is not available.');
	}

	return sha256Hex(doc).then((hash) => {
		const id = namespace.idFromName(hash);
		return namespace.get(id) as unknown as ReactionDocumentStub;
	});
}

export function parseWidgetPayload(payload: unknown): WidgetPayload | JsonFailure {
	if (!isRecord(payload)) {
		return json({ error: 'Expected a JSON object.' }, { status: 400 });
	}

	const doc = typeof payload.doc === 'string' ? normalizeDocId(payload.doc) : null;
	const returnUrl = typeof payload.returnUrl === 'string' ? normalizeReturnUrl(payload.returnUrl) : null;
	const editToken = typeof payload.editToken === 'string' && payload.editToken.trim()
		? payload.editToken.trim()
		: null;

	if (!doc) return json({ error: 'Content ID is required.' }, { status: 400 });
	if (!returnUrl) return json({ error: 'Return URL must be a valid http(s) URL.' }, { status: 400 });
	if (payload.verifyReferrer !== undefined && typeof payload.verifyReferrer !== 'boolean') {
		return json({ error: 'Verify referrer must be a boolean.' }, { status: 400 });
	}
	if (!Array.isArray(payload.reactions) || payload.reactions.length === 0) {
		return json({ error: 'At least one reaction is required.' }, { status: 400 });
	}
	if (payload.reactions.length > MAX_REACTIONS) {
		return json({ error: `A widget can have at most ${MAX_REACTIONS} reactions.` }, { status: 400 });
	}

	const reactions: WidgetReactionInput[] = [];
	const seenIds = new Set<string>();

	for (const entry of payload.reactions) {
		if (!isRecord(entry)) {
			return json({ error: 'Each reaction must be an object.' }, { status: 400 });
		}

		const id = typeof entry.id === 'string' ? normalizeReactionId(entry.id) : null;
		const emoji = typeof entry.emoji === 'string' ? entry.emoji.trim() : '';
		const label = typeof entry.label === 'string' ? entry.label.trim().slice(0, MAX_LABEL_LENGTH) : '';
		const description = typeof entry.description === 'string'
			? entry.description.trim().slice(0, MAX_DESCRIPTION_LENGTH)
			: '';

		if (!id) return json({ error: 'Each reaction needs a valid ID.' }, { status: 400 });
		if (seenIds.has(id)) return json({ error: `Duplicate reaction ID: ${id}.` }, { status: 400 });
		if (!emoji) return json({ error: 'Each reaction needs an emoji.' }, { status: 400 });
		if (!label) return json({ error: 'Each reaction needs a label.' }, { status: 400 });

		seenIds.add(id);
		reactions.push({ id, emoji, label, description });
	}

	return {
		doc,
		returnUrl,
		verifyReferrer: payload.verifyReferrer as boolean | undefined,
		reactions,
		editToken
	};
}

export function parseDocAndReaction(event: RequestEvent): { doc: string; reaction: string } | JsonFailure {
	const doc = normalizeDocId(event.url.searchParams.get('doc') ?? '');
	const reaction = normalizeReactionId(event.url.searchParams.get('r') ?? '');

	if (!doc) return json({ error: 'A valid doc query parameter is required.' }, { status: 400 });
	if (!reaction) return json({ error: 'A valid r query parameter is required.' }, { status: 400 });

	return { doc, reaction };
}

export async function createEditToken(): Promise<string> {
	const bytes = new Uint8Array(TOKEN_BYTES);
	crypto.getRandomValues(bytes);
	return bytesToBase64Url(bytes);
}

export async function hashEditToken(token: string): Promise<string> {
	return sha256Hex(token);
}

export function getVisitorId(event: RequestEvent): string {
	let visitorId = event.cookies.get(VISITOR_COOKIE);

	if (!visitorId) {
		visitorId = crypto.randomUUID();
		event.cookies.set(VISITOR_COOKIE, visitorId, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: event.url.protocol === 'https:',
			maxAge: VISITOR_MAX_AGE
		});
	}

	return visitorId;
}

export async function getVoterHash(event: RequestEvent, doc: string): Promise<string> {
	return hmacHex(getHmacSecret(event), `${doc}\0${getVisitorId(event)}`);
}

export function getHmacSecret(event: RequestEvent): string {
	const configured = event.platform?.env.PLUSMARK_HMAC_SECRET;
	if (configured) return configured;

	if (isLocalhost(event.url.hostname)) {
		return 'plusmark-local-development-secret';
	}

	error(500, 'PLUSMARK_HMAC_SECRET is not configured.');
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return bytesToHex(new Uint8Array(digest));
}

async function hmacHex(secret: string, value: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
	return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64Url(bytes: Uint8Array): string {
	const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isLocalhost(hostname: string): boolean {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

type DevFailure = {
	ok: false;
	status: number;
	message: string;
};

type DevRecord = {
	widget: PublicWidget;
	editTokenHash: string;
	votes: Map<string, Set<string>>;
};

class DevReactionDocument implements ReactionDocumentStub {
	private submissions = new Map<string, { expiresAt: number; voter: string; reaction: string; result: { ok: true; count: number; active: boolean; returnUrl: string } }>();
	private record: DevRecord | null = null;
	private publications = new Map<string, BadgePublication>();

	constructor(private readonly doc: string) {}

	async saveWidget(command: Parameters<ReactionDocumentStub['saveWidget']>[0]) {
		const now = Date.now();

		if (this.record && this.record.editTokenHash !== command.editTokenHash) {
			return {
				ok: false,
				status: command.editTokenHash ? 403 : 409,
				message: command.editTokenHash
					? 'The edit token is not valid for this content ID.'
					: 'This content ID already exists. An edit token is required to update it.'
			} satisfies DevFailure;
		}

		const previousCounts = new Map(
			this.record?.widget.reactions.map((reaction) => [reaction.id, reaction.count]) ?? []
		);
		const nextReactionIds = new Set(command.widget.reactions.map((reaction) => reaction.id));
		const votes = this.record?.votes ?? new Map<string, Set<string>>();

		for (const reactionId of votes.keys()) {
			if (!nextReactionIds.has(reactionId)) votes.delete(reactionId);
		}
		for (const reactionId of this.publications.keys()) {
			if (!nextReactionIds.has(reactionId)) this.publications.delete(reactionId);
		}

		this.record = {
			editTokenHash: this.record?.editTokenHash ?? command.createEditTokenHash,
			votes,
			widget: {
				doc: command.widget.doc,
				returnUrl: command.widget.returnUrl,
				verifyReferrer: command.widget.verifyReferrer ?? this.record?.widget.verifyReferrer ?? false,
				reactions: command.widget.reactions.map((reaction) => ({
					...reaction,
					count: previousCounts.get(reaction.id) ?? 0
				})),
				createdAt: this.record?.widget.createdAt ?? now,
				updatedAt: now
			}
		};

		return {
			ok: true as const,
			widget: this.record.widget,
			created: previousCounts.size === 0
		};
	}

	async getWidget() {
		if (!this.record) return this.unknownDocument();

		return {
			ok: true as const,
			widget: this.record.widget,
			created: false
		};
	}

	async getBadge(reactionId: string) {
		if (!this.record) return this.unknownDocument();

		const reaction = this.record.widget.reactions.find((reaction) => reaction.id === reactionId);
		if (!reaction) {
			return {
				ok: false,
				status: 404,
				message: 'Unknown reaction.'
			} satisfies DevFailure;
		}

		const previous = this.publications.get(reactionId) ?? null;
		const publication = advanceBadgePublication(previous, reaction.count, Date.now(), false);
		if (previous && badgeRefreshAt(previous) > 0 && badgeRefreshAt(previous) <= Date.now()) {
			this.publications.set(reactionId, publication);
		}
		return {
			ok: true as const,
			reaction: { ...reaction, count: publication.published_count },
			throttled: publication.throttled_until > 0,
			refreshAt: badgeRefreshAt(publication)
		};
	}

	async toggleReaction(reactionId: string, voterHash: string, referrer: string | null = null, submission?: { id: string; expiresAt: number }) {
		if (submission) {
			if (submission.expiresAt <= Date.now()) return { ok: false, status: 410, message: 'This reaction link has expired. Click the badge again.' } satisfies DevFailure;
			for (const [id, item] of this.submissions) if (item.expiresAt <= Date.now()) this.submissions.delete(id);
			const previous = this.submissions.get(submission.id);
			if (previous) return previous.voter === voterHash && previous.reaction === reactionId ? previous.result
				: { ok: false, status: 409, message: 'Submission already used.' } satisfies DevFailure;
		}
		if (!this.record) return this.unknownDocument();
		if (this.record.widget.verifyReferrer && !isReactionSourceAllowed(this.record.widget.returnUrl, referrer)) {
			return reactionSourceFailure(this.record.widget.returnUrl);
		}

		const reaction = this.record.widget.reactions.find((reaction) => reaction.id === reactionId);
		if (!reaction) {
			return {
				ok: false,
				status: 404,
				message: 'Unknown reaction.'
			} satisfies DevFailure;
		}

		let reactionVotes = this.record.votes.get(reactionId);
		if (!reactionVotes) {
			reactionVotes = new Set<string>();
			this.record.votes.set(reactionId, reactionVotes);
		}

		const active = !reactionVotes.has(voterHash);
		if (active) {
			reactionVotes.add(voterHash);
			reaction.count += 1;
		} else {
			reactionVotes.delete(voterHash);
			reaction.count = Math.max(0, reaction.count - 1);
		}

		this.record.widget.updatedAt = Date.now();
		this.publications.set(reactionId, advanceBadgePublication(
			this.publications.get(reactionId) ?? null, reaction.count, Date.now(), true
		));

		const result = {
			ok: true as const,
			count: reaction.count,
			active,
			returnUrl: this.record.widget.returnUrl
		};
		if (submission) this.submissions.set(submission.id, { ...submission, voter: voterHash, reaction: reactionId, result });
		return result;
	}

	private unknownDocument(): DevFailure {
		return {
			ok: false,
			status: 404,
			message: `Unknown content ID${this.doc ? `: ${this.doc}` : ''}.`
		};
	}
}
