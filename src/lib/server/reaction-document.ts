import type { BadgeTheme } from '../badge-theme';
import { DurableObject } from 'cloudflare:workers';
import { DocumentStatistics } from './document-statistics';
import { isReactionSourceAllowed, reactionSourceFailure } from './reaction-source';
import { formatReactionCount } from '../reaction-count';
import { advanceBadgePublication, badgeRefreshAt, type BadgePublication } from './badge-throttle';
import type { PublicWidget, PublicWidgetReaction, WidgetReactionInput } from '$lib/widget';
import {
	discoverGitHubCamoTargets,
	purgeCamoUrl,
	toSafeGitHubPageUrl,
	type CamoTarget
} from './github-camo';

type SqlRow = Record<string, ArrayBuffer | string | number | null>;

type WidgetRow = SqlRow & {
	doc: string;
	return_url: string;
	verify_referrer: number;
	badge_theme: BadgeTheme;
	edit_token_hash: string;
	created_at: number;
	updated_at: number;
};

type ReactionRow = SqlRow & {
	id: string;
	emoji: string;
	label: string;
	description: string;
	sort_order: number;
	count: number | null;
};

type ReactionIdRow = SqlRow & {
	id: string;
};

type GithubSyncStateRow = SqlRow & {
	key: string;
	github_url: string;
	next_discovery_at: number;
	last_discovery_at: number;
	discovery_attempts: number;
	last_discovery_status: number;
	purge_window_started_at: number;
	purge_window_count: number;
	updated_at: number;
};

type CamoTargetRow = SqlRow & {
	reaction: string;
	canonical_url: string;
	camo_url: string;
	discovered_at: number;
	purge_pending: number; // Pending generation; increments preserve votes arriving during a purge.
	next_purge_at: number;
	last_purge_attempt_at: number;
	last_purge_status: number;
};

type SaveWidgetCommand = {
	widget: {
		doc: string;
		returnUrl: string;
		verifyReferrer?: boolean;
		badgeTheme?: BadgeTheme;
		reactions: WidgetReactionInput[];
	};
	editTokenHash: string | null;
	createEditTokenHash: string;
};

type RpcFailure = {
	ok: false;
	status: number;
	message: string;
	returnUrl?: string;
};

type WidgetSuccess = {
	ok: true;
	widget: PublicWidget;
	created: boolean;
};

type BadgeSuccess = {
	ok: true;
	badgeTheme: BadgeTheme;
	returnUrl: string;
	reaction: PublicWidgetReaction;
	throttled: boolean;
	refreshAt: number;
};

type ToggleSuccess = {
	ok: true;
	count: number;
	active: boolean;
	returnUrl: string;
	automatic?: boolean;
	cancelled?: boolean;
};

const GITHUB_STATE_KEY = 'default';
const DISCOVERY_DELAYS_MS = [
	60_000,
	5 * 60_000,
	30 * 60_000,
	6 * 60 * 60_000,
	24 * 60 * 60_000
];
const DISCOVERY_EXHAUSTED_RETRY_MS = 24 * 60 * 60_000;
const PURGE_DEBOUNCE_MS = 60_000;
const PURGE_MIN_INTERVAL_MS = 15 * 60_000;
const PURGE_WINDOW_MS = 60 * 60_000;
const PURGE_WINDOW_LIMIT = 8;
const PURGE_BATCH_LIMIT = 4;
const PURGE_BATCH_SPACING_MS = 60_000;

export class ReactionDocument extends DurableObject<Env> {
	private initialized = false;
	private statistics: DocumentStatistics;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.initialize();
		this.statistics = new DocumentStatistics(ctx.storage);
	}

	async saveWidget(command: SaveWidgetCommand): Promise<WidgetSuccess | RpcFailure> {
		const saveResult = this.ctx.storage.transactionSync(() => {
			const existing = this.getWidgetRow();
			const now = Date.now();

			if (existing && existing.edit_token_hash !== command.editTokenHash) {
				return {
					ok: false,
					status: command.editTokenHash ? 403 : 409,
					message: command.editTokenHash
						? 'The edit token is not valid for this content ID.'
						: 'This content ID already exists. An edit token is required to update it.'
				} satisfies RpcFailure;
			}

			if (existing) {
				this.ctx.storage.sql.exec(
					'UPDATE widget SET return_url = ?, verify_referrer = ?, badge_theme = ?, updated_at = ? WHERE doc = ?',
					command.widget.returnUrl,
					Number(command.widget.verifyReferrer ?? Boolean(existing.verify_referrer)),
					command.widget.badgeTheme ?? existing.badge_theme,
					now,
					command.widget.doc
				);
			} else {
				this.ctx.storage.sql.exec(
					'INSERT INTO widget (doc, return_url, verify_referrer, badge_theme, edit_token_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
					command.widget.doc,
					command.widget.returnUrl,
					Number(command.widget.verifyReferrer ?? false),
					command.widget.badgeTheme ?? 'light',
					command.createEditTokenHash,
					now,
					now
				);
			}

			this.statistics.recordReactions(command.widget.reactions.map(reaction => reaction.id));
			this.replaceReactions(command.widget.reactions);

			return {
				ok: true as const,
				created: !existing,
				themeChanged: !!existing && command.widget.badgeTheme !== undefined && command.widget.badgeTheme !== existing.badge_theme
			};
		});

		if (!saveResult.ok) return saveResult;

		const widget = this.readWidget();
		if (!widget) {
			return {
				ok: false,
				status: 500,
				message: 'The widget could not be read after saving.'
			};
		}

		await this.syncGitHubStateAfterWidgetSave();
		if (saveResult.themeChanged) {
			for (const reaction of widget.reactions) await this.queueCamoPurge(widget.returnUrl, reaction.id);
		}
		await this.ensureAlarmScheduled();

		return {
			ok: true,
			widget,
			created: saveResult.created
		};
	}

	async hasVote(reactionId: string, voterHash: string): Promise<boolean> {
		return this.ctx.storage.sql.exec(
			'SELECT 1 FROM votes WHERE reaction = ? AND voter_hash = ? LIMIT 1', reactionId, voterHash
		).toArray().length > 0;
	}

	async getWidget(): Promise<WidgetSuccess | RpcFailure> {
		const widget = this.readWidget();

		if (!widget) {
			return {
				ok: false,
				status: 404,
				message: 'Unknown content ID.'
			};
		}

		return {
			ok: true,
			widget,
			created: false
		};
	}

	async getBadge(reactionId: string): Promise<BadgeSuccess | RpcFailure> {
		const widget = this.getWidgetRow();
		if (!widget) {
			return {
				ok: false,
				status: 404,
				message: 'Unknown content ID.'
			};
		}

		const reaction = this.readReaction(reactionId);
		if (!reaction) {
			return {
				ok: false,
				status: 404,
				message: 'Unknown reaction.'
			};
		}

		const publication = this.updateBadgePublication(reactionId, reaction.count, reaction.count, false);
		if (publication.changed) await this.queueCamoPurge(widget.return_url, reactionId);
		await this.maybeScheduleGitHubDiscoveryFromBadge(reactionId);
		if (publication.state.throttled_until) await this.ensureAlarmScheduled();

		return {
			ok: true,
			reaction: { ...reaction, count: publication.state.published_count },
			badgeTheme: widget.badge_theme,
			returnUrl: widget.return_url,
			throttled: publication.state.throttled_until > 0,
			refreshAt: badgeRefreshAt(publication.state)
		};
	}

	async toggleReaction(reactionId: string, voterHash: string, referrer: string | null = null, submission?: { id: string; expiresAt: number; automatic?: boolean }): Promise<ToggleSuccess | RpcFailure> {
		let badgeChanged = false;
		let changedDoc: string | null = null;
		const result = this.ctx.storage.transactionSync(() => {
			// Receipt and vote commit together, including concurrent retries and object restarts.
			if (submission) {
				if (submission.expiresAt <= Date.now()) return { ok: false, status: 410, message: 'This reaction link has expired. Click the badge again.' } satisfies RpcFailure;
				this.ctx.storage.sql.exec('DELETE FROM reaction_submissions WHERE expires_at <= ?', Date.now());
				const previous = this.ctx.storage.sql.exec<{ voter: string; reaction: string; result: string }>(
					'SELECT voter, reaction, result FROM reaction_submissions WHERE id = ?', submission.id
				).toArray()[0];
				if (previous) {
					if (previous.voter !== voterHash || previous.reaction !== reactionId) return { ok: false, status: 409, message: 'Submission already used.' } satisfies RpcFailure;
					const receipt = JSON.parse(previous.result) as ToggleSuccess;
					return receipt.cancelled ? { ok: false, status: 409, message: 'Submission cancelled.' } satisfies RpcFailure : receipt;
				}
			}
			const widget = this.getWidgetRow();
			if (!widget) {
				return {
					ok: false,
					status: 404,
					message: 'Unknown content ID.'
				} satisfies RpcFailure;
			}

			if (widget.verify_referrer && !isReactionSourceAllowed(widget.return_url, referrer)) {
				return reactionSourceFailure(widget.return_url);
			}

			const reaction = this.readReaction(reactionId);
			if (!reaction) {
				return {
					ok: false,
					status: 404,
					message: 'Unknown reaction.'
				} satisfies RpcFailure;
			}

			const vote = this.ctx.storage.sql
				.exec(
					'SELECT voter_hash FROM votes WHERE reaction = ? AND voter_hash = ? LIMIT 1',
					reactionId,
					voterHash
				)
				.toArray()[0];

			let active = true;

			if (vote) {
				active = false;
				this.ctx.storage.sql.exec(
					'DELETE FROM votes WHERE reaction = ? AND voter_hash = ?',
					reactionId,
					voterHash
				);
				this.ctx.storage.sql.exec(
					'UPDATE counts SET count = CASE WHEN count > 0 THEN count - 1 ELSE 0 END WHERE reaction = ?',
					reactionId
				);
			} else {
				this.ctx.storage.sql.exec(
					'INSERT INTO votes (reaction, voter_hash, created_at) VALUES (?, ?, ?)',
					reactionId,
					voterHash,
					Date.now()
				);
				this.ctx.storage.sql.exec(
					'INSERT OR IGNORE INTO counts (reaction, count) VALUES (?, 0)',
					reactionId
				);
				this.ctx.storage.sql.exec(
					'UPDATE counts SET count = count + 1 WHERE reaction = ?',
					reactionId
				);
			}

			const count = Number(
				this.ctx.storage.sql
					.exec<{ count: number }>('SELECT count FROM counts WHERE reaction = ? LIMIT 1', reactionId)
					.toArray()[0]?.count ?? 0
			);
			const publication = this.updateBadgePublication(reactionId, count, reaction.count ?? 0, true);
			badgeChanged = publication.changed;

			const receipt = {
				ok: true,
				count,
				active,
				automatic: submission?.automatic === true,
				returnUrl: widget.return_url
			} satisfies ToggleSuccess;
			if (submission) this.ctx.storage.sql.exec(
				'INSERT INTO reaction_submissions (id, voter, reaction, result, expires_at) VALUES (?, ?, ?, ?, ?)',
				submission.id, voterHash, reactionId, JSON.stringify(receipt), submission.expiresAt
			);
			this.ctx.storage.sql.exec('DELETE FROM reaction_vote_actions WHERE expires_at <= ?', Date.now());
			this.ctx.storage.sql.exec('INSERT OR REPLACE INTO reaction_vote_actions (reaction, voter, id, expires_at) VALUES (?, ?, ?, ?)',
				reactionId, voterHash, submission?.id ?? crypto.randomUUID(), submission?.expiresAt ?? Date.now() + 600_000);
			this.statistics.recordVote();
			changedDoc = widget.doc;
			return receipt;
		});

		// Only emit after commit; replayed receipts and rejected submissions never reach this log.
		if (result.ok && changedDoc !== null) console.log({
			event: 'reaction.vote', at: new Date().toISOString(), doc: changedDoc,
			reaction: reactionId, voter: voterHash, submissionId: submission?.id ?? null,
			active: result.active, count: result.count
		});

		if (result.ok && badgeChanged) {
			await this.queueCamoPurge(result.returnUrl, reactionId);
		}
		if (result.ok) await this.ensureAlarmScheduled();

		return result;
	}

	async cancelReaction(reactionId: string, voterHash: string, submission: { id: string; expiresAt: number }): Promise<ToggleSuccess | RpcFailure> {
		let badgeChanged = false;
		let reversed = false;
		let changedDoc: string | null = null;
		const result = this.ctx.storage.transactionSync(() => {
			if (submission.expiresAt <= Date.now()) return { ok: false, status: 410, message: 'Cancellation expired. Please click the badge again.' } satisfies RpcFailure;
			const sql = this.ctx.storage.sql;
			sql.exec('DELETE FROM reaction_submissions WHERE expires_at <= ?', Date.now());
			const previous = sql.exec<{ voter: string; reaction: string; result: string }>('SELECT voter, reaction, result FROM reaction_submissions WHERE id = ?', submission.id).toArray()[0];
			if (previous && (previous.voter !== voterHash || previous.reaction !== reactionId)) return { ok: false, status: 409, message: 'Submission already used.' } satisfies RpcFailure;
			const receipt = previous ? JSON.parse(previous.result) as ToggleSuccess : null;
			if (receipt?.cancelled) return receipt;
			if (receipt && !receipt.automatic) return { ok: false, status: 409, message: 'Only automatic submissions can be cancelled.' } satisfies RpcFailure;
			const widget = this.getWidgetRow();
			const reaction = this.readReaction(reactionId);
			if (!widget || !reaction) return { ok: false, status: 404, message: 'Unknown reaction.' } satisfies RpcFailure;
			let active = sql.exec('SELECT 1 FROM votes WHERE reaction = ? AND voter_hash = ?', reactionId, voterHash).toArray().length > 0;
			const latest = sql.exec<{ id: string }>('SELECT id FROM reaction_vote_actions WHERE reaction = ? AND voter = ?', reactionId, voterHash).toArray()[0];
			// Reverse only this page's action; a later vote in another tab takes precedence.
			if (receipt && latest?.id === submission.id && active === receipt.active) {
				active = !active;
				if (active) sql.exec('INSERT INTO votes (reaction, voter_hash, created_at) VALUES (?, ?, ?)', reactionId, voterHash, Date.now());
				else sql.exec('DELETE FROM votes WHERE reaction = ? AND voter_hash = ?', reactionId, voterHash);
				sql.exec('UPDATE counts SET count = MAX(0, count + ?) WHERE reaction = ?', active ? 1 : -1, reactionId);
				sql.exec('UPDATE reaction_vote_actions SET id = ? WHERE reaction = ? AND voter = ?', `cancel:${submission.id}`, reactionId, voterHash);
				reversed = true;
			}
			const count = sql.exec<{ count: number }>('SELECT count FROM counts WHERE reaction = ?', reactionId).toArray()[0]?.count ?? 0;
			if (reversed) badgeChanged = this.updateBadgePublication(reactionId, count, reaction.count ?? 0, true).changed;
			const cancelled = { ok: true, count, active, returnUrl: widget.return_url, cancelled: true } satisfies ToggleSuccess;
			// A receipt also blocks a delayed vote when cancellation reaches the server first.
			sql.exec('INSERT OR REPLACE INTO reaction_submissions (id, voter, reaction, result, expires_at) VALUES (?, ?, ?, ?, ?)',
				submission.id, voterHash, reactionId, JSON.stringify(cancelled), submission.expiresAt);
			changedDoc = widget.doc;
			return cancelled;
		});
		if (result.ok && changedDoc !== null) console.log({ event: 'reaction.cancel', at: new Date().toISOString(), doc: changedDoc, reaction: reactionId, voter: voterHash, submissionId: submission.id, reversed, active: result.active, count: result.count });
		if (result.ok && badgeChanged) await this.queueCamoPurge(result.returnUrl, reactionId);
		if (result.ok && reversed) await this.ensureAlarmScheduled();
		return result;
	}

	async alarm(): Promise<void> {
		this.initialize();
		await this.statistics.flush(this.ctx.id.toString(), this.env.SERVICE_STATISTICS);
		await this.publishDueBadges();
		await this.runGitHubMaintenance();
	}

	private updateBadgePublication(reactionId: string, count: number, previousCount: number, isVote: boolean) {
		const previous = this.ctx.storage.sql.exec<BadgePublication & SqlRow>(
			'SELECT * FROM badge_publications WHERE reaction = ?', reactionId
		).toArray()[0] ?? null;
		const state = advanceBadgePublication(previous, count, Date.now(), isVote);
		const previousDisplay = previous?.throttled_until ? previous.published_count : previousCount;
		const changed = Boolean(previous?.throttled_until) !== Boolean(state.throttled_until)
			|| formatReactionCount(previousDisplay) !== formatReactionCount(state.published_count);
		// Reads of an unchanged snapshot need no storage write.
		if (isVote || (previous && badgeRefreshAt(previous) > 0 && badgeRefreshAt(previous) <= Date.now())) {
			this.ctx.storage.sql.exec(
				`INSERT INTO badge_publications VALUES (?, ?, ?, ?, ?, ?)
				ON CONFLICT(reaction) DO UPDATE SET window_started_at = excluded.window_started_at,
				window_count = excluded.window_count, throttled_until = excluded.throttled_until,
				published_count = excluded.published_count, next_publish_at = excluded.next_publish_at`,
				reactionId, state.window_started_at, state.window_count, state.throttled_until,
				state.published_count, state.next_publish_at
			);
		}
		return { state, changed };
	}

	private async publishDueBadges() {
		const due = this.ctx.storage.sql.exec<ReactionIdRow>(
			`SELECT reaction AS id FROM badge_publications WHERE throttled_until > 0
			AND (next_publish_at <= ? OR throttled_until <= ?)`, Date.now(), Date.now()
		).toArray();
		for (const { id } of due) {
			const reaction = this.readReaction(id);
			if (!reaction) continue;
			const publication = this.updateBadgePublication(id, reaction.count, reaction.count, false);
			if (publication.changed) {
				const widget = this.getWidgetRow();
				if (widget) await this.queueCamoPurge(widget.return_url, id);
			}
		}
	}

	private initialize() {
		if (this.initialized) return;

		const sql = this.ctx.storage.sql;
		sql.exec('CREATE TABLE IF NOT EXISTS reaction_submissions (id TEXT PRIMARY KEY, voter TEXT NOT NULL, reaction TEXT NOT NULL, result TEXT NOT NULL, expires_at INTEGER NOT NULL)');
		sql.exec('CREATE INDEX IF NOT EXISTS reaction_submissions_expiry ON reaction_submissions (expires_at)');
		sql.exec('CREATE TABLE IF NOT EXISTS reaction_vote_actions (reaction TEXT NOT NULL, voter TEXT NOT NULL, id TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY (reaction, voter))');
		sql.exec('CREATE INDEX IF NOT EXISTS reaction_vote_actions_expiry ON reaction_vote_actions (expires_at)');
		sql.exec(`CREATE TABLE IF NOT EXISTS badge_publications (
			reaction TEXT PRIMARY KEY, window_started_at INTEGER NOT NULL, window_count INTEGER NOT NULL,
			throttled_until INTEGER NOT NULL, published_count INTEGER NOT NULL, next_publish_at INTEGER NOT NULL
		)`);
		sql.exec(
			'CREATE TABLE IF NOT EXISTS widget (doc TEXT PRIMARY KEY, return_url TEXT NOT NULL, edit_token_hash TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)'
		);
		if (!sql.exec<{ name: string }>('PRAGMA table_info(widget)').toArray().some(column => column.name === 'verify_referrer')) {
			sql.exec('ALTER TABLE widget ADD COLUMN verify_referrer INTEGER NOT NULL DEFAULT 0');
		}
		if (!sql.exec<{ name: string }>('PRAGMA table_info(widget)').toArray().some(column => column.name === 'badge_theme')) {
			sql.exec("ALTER TABLE widget ADD COLUMN badge_theme TEXT NOT NULL DEFAULT 'light'");
		}
		sql.exec(
			'CREATE TABLE IF NOT EXISTS reactions (id TEXT PRIMARY KEY, emoji TEXT NOT NULL, label TEXT NOT NULL, description TEXT NOT NULL DEFAULT \'\', sort_order INTEGER NOT NULL)'
		);
		sql.exec(
			'CREATE TABLE IF NOT EXISTS counts (reaction TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0)'
		);
		sql.exec(
			'CREATE TABLE IF NOT EXISTS votes (reaction TEXT NOT NULL, voter_hash TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (reaction, voter_hash))'
		);
		sql.exec(
			`CREATE TABLE IF NOT EXISTS github_sync_state (
				key TEXT PRIMARY KEY,
				github_url TEXT NOT NULL,
				next_discovery_at INTEGER NOT NULL DEFAULT 0,
				last_discovery_at INTEGER NOT NULL DEFAULT 0,
				discovery_attempts INTEGER NOT NULL DEFAULT 0,
				last_discovery_status INTEGER NOT NULL DEFAULT 0,
				purge_window_started_at INTEGER NOT NULL DEFAULT 0,
				purge_window_count INTEGER NOT NULL DEFAULT 0,
				updated_at INTEGER NOT NULL
			)`
		);
		sql.exec(
			`CREATE TABLE IF NOT EXISTS camo_targets (
				reaction TEXT PRIMARY KEY,
				canonical_url TEXT NOT NULL,
				camo_url TEXT NOT NULL,
				discovered_at INTEGER NOT NULL,
				purge_pending INTEGER NOT NULL DEFAULT 0,
				next_purge_at INTEGER NOT NULL DEFAULT 0,
				last_purge_attempt_at INTEGER NOT NULL DEFAULT 0,
				last_purge_status INTEGER NOT NULL DEFAULT 0
			)`
		);
		sql.exec(
			`CREATE TABLE IF NOT EXISTS pending_camo_purges (
				reaction TEXT PRIMARY KEY,
				requested_at INTEGER NOT NULL
			)`
		);

		this.initialized = true;
	}

	private replaceReactions(reactions: WidgetReactionInput[]) {
		const ids = reactions.map((reaction) => reaction.id);
		const placeholders = ids.map(() => '?').join(', ');

		this.ctx.storage.sql.exec(`DELETE FROM reactions WHERE id NOT IN (${placeholders})`, ...ids);
		this.ctx.storage.sql.exec(`DELETE FROM counts WHERE reaction NOT IN (${placeholders})`, ...ids);
		this.ctx.storage.sql.exec(`DELETE FROM badge_publications WHERE reaction NOT IN (${placeholders})`, ...ids);
		this.ctx.storage.sql.exec(`DELETE FROM votes WHERE reaction NOT IN (${placeholders})`, ...ids);
		this.ctx.storage.sql.exec(`DELETE FROM camo_targets WHERE reaction NOT IN (${placeholders})`, ...ids);
		this.ctx.storage.sql.exec(`DELETE FROM pending_camo_purges WHERE reaction NOT IN (${placeholders})`, ...ids);

		reactions.forEach((reaction, index) => {
			this.ctx.storage.sql.exec(
				`INSERT INTO reactions (id, emoji, label, description, sort_order)
					VALUES (?, ?, ?, ?, ?)
					ON CONFLICT(id) DO UPDATE SET
						emoji = excluded.emoji,
						label = excluded.label,
						description = excluded.description,
						sort_order = excluded.sort_order`,
				reaction.id,
				reaction.emoji,
				reaction.label,
				reaction.description,
				index
			);
			this.ctx.storage.sql.exec(
				'INSERT OR IGNORE INTO counts (reaction, count) VALUES (?, 0)',
				reaction.id
			);
		});
	}

	private async syncGitHubStateAfterWidgetSave() {
		const shouldSchedule = this.ctx.storage.transactionSync(() =>
			this.maybeScheduleGitHubDiscoveryTransaction(Date.now(), DISCOVERY_DELAYS_MS[0], true)
		);

		if (shouldSchedule) await this.ensureAlarmScheduled();
	}

	private async maybeScheduleGitHubDiscoveryFromBadge(reactionId: string) {
		const shouldSchedule = this.ctx.storage.transactionSync(() => {
			if (this.getCamoTarget(reactionId)) return false;
			return this.maybeScheduleGitHubDiscoveryTransaction(Date.now(), DISCOVERY_DELAYS_MS[0], false);
		});

		if (shouldSchedule) await this.ensureAlarmScheduled();
	}

	private async queueCamoPurge(returnUrl: string, reactionId: string) {
		if (!toSafeGitHubPageUrl(returnUrl)) return;

		const shouldSchedule = this.ctx.storage.transactionSync(() => {
			const now = Date.now();
			const target = this.getCamoTarget(reactionId);

			if (!target) {
				this.ctx.storage.sql.exec(
					`INSERT INTO pending_camo_purges (reaction, requested_at)
						VALUES (?, ?)
						ON CONFLICT(reaction) DO UPDATE SET requested_at = excluded.requested_at`,
					reactionId,
					now
				);
				return this.maybeScheduleGitHubDiscoveryTransaction(now, DISCOVERY_DELAYS_MS[0], false);
			}

			const earliest = Math.max(
				now + PURGE_DEBOUNCE_MS,
				Number(target.last_purge_attempt_at || 0) + PURGE_MIN_INTERVAL_MS
			);
			const nextPurgeAt = target.purge_pending && target.next_purge_at
				? Math.min(Number(target.next_purge_at), earliest)
				: earliest;

			this.ctx.storage.sql.exec(
				`UPDATE camo_targets
					SET purge_pending = purge_pending + 1, next_purge_at = ?
					WHERE reaction = ?`,
				nextPurgeAt,
				reactionId
			);

			return true;
		});

		if (shouldSchedule) await this.ensureAlarmScheduled();
	}

	private maybeScheduleGitHubDiscoveryTransaction(
		now: number,
		delayMs: number,
		resetAttempts: boolean
	): boolean {
		const widget = this.getWidgetRow();
		if (!widget) return false;

		const githubUrl = toSafeGitHubPageUrl(widget.return_url);
		if (!githubUrl) {
			this.clearGithubSyncState();
			return false;
		}

		let state = this.getGithubState();
		let attempts = Number(state?.discovery_attempts ?? 0);
		let targetCount = this.countCamoTargets();
		const reactionCount = this.countReactions();

		if (reactionCount === 0) return false;

		if (!state || state.github_url !== githubUrl) {
			this.ctx.storage.sql.exec('DELETE FROM camo_targets');
			this.ctx.storage.sql.exec('DELETE FROM pending_camo_purges');
			state = null;
			attempts = 0;
			targetCount = 0;
		}

		if (targetCount >= reactionCount) return false;

		if (
			state &&
			!resetAttempts &&
			attempts >= DISCOVERY_DELAYS_MS.length &&
			now - Number(state.last_discovery_at || 0) < DISCOVERY_EXHAUSTED_RETRY_MS
		) {
			return false;
		}

		if (resetAttempts || attempts >= DISCOVERY_DELAYS_MS.length) attempts = 0;

		const nextDiscoveryAt = now + delayMs;
		if (state && !resetAttempts && state.next_discovery_at > 0 && state.next_discovery_at <= nextDiscoveryAt) {
			return true;
		}

		this.ctx.storage.sql.exec(
			`INSERT INTO github_sync_state (
				key,
				github_url,
				next_discovery_at,
				last_discovery_at,
				discovery_attempts,
				last_discovery_status,
				purge_window_started_at,
				purge_window_count,
				updated_at
			)
				VALUES (?, ?, ?, 0, ?, 0, 0, 0, ?)
				ON CONFLICT(key) DO UPDATE SET
					github_url = excluded.github_url,
					next_discovery_at = excluded.next_discovery_at,
					discovery_attempts = excluded.discovery_attempts,
					updated_at = excluded.updated_at`,
			GITHUB_STATE_KEY,
			githubUrl,
			nextDiscoveryAt,
			attempts,
			now
		);

		return true;
	}

	private async runGitHubMaintenance() {
		await this.runGitHubDiscoveryIfDue(Date.now());
		await this.runCamoPurgeBatch(Date.now());
		await this.ensureAlarmScheduled();
	}

	private async runGitHubDiscoveryIfDue(now: number) {
		const state = this.getGithubState();
		if (!state || state.next_discovery_at <= 0 || state.next_discovery_at > now) return;

		const widget = this.getWidgetRow();
		if (!widget) {
			this.clearGithubSyncState();
			return;
		}

		const githubUrl = toSafeGitHubPageUrl(widget.return_url);
		if (!githubUrl || githubUrl !== state.github_url) {
			this.clearGithubSyncState();
			return;
		}

		const reactionIds = this.readReactionIds();
		const attemptNumber = Number(state.discovery_attempts) + 1;

		this.ctx.storage.sql.exec(
			`UPDATE github_sync_state
				SET next_discovery_at = 0,
					last_discovery_at = ?,
					discovery_attempts = ?,
					updated_at = ?
				WHERE key = ?`,
			now,
			attemptNumber,
			now,
			GITHUB_STATE_KEY
		);

		const result = await discoverGitHubCamoTargets(githubUrl, widget.doc, reactionIds);
		const completedAt = Date.now();

		this.ctx.storage.transactionSync(() => {
			const currentState = this.getGithubState();
			if (!currentState || currentState.github_url !== githubUrl) return;

			this.storeCamoTargets(result.targets, completedAt);

			const targetCount = this.countCamoTargets();
			const reactionCount = this.countReactions();
			const nextDelay = DISCOVERY_DELAYS_MS[attemptNumber] ?? 0;
			const nextDiscoveryAt = targetCount < reactionCount && nextDelay > 0
				? completedAt + nextDelay
				: 0;

			this.ctx.storage.sql.exec(
				`UPDATE github_sync_state
					SET next_discovery_at = ?,
						last_discovery_status = ?,
						updated_at = ?
					WHERE key = ?`,
				nextDiscoveryAt,
				result.status,
				completedAt,
				GITHUB_STATE_KEY
			);
		});
	}

	private storeCamoTargets(targets: CamoTarget[], now: number) {
		for (const target of targets) {
			const pendingPurge = this.ctx.storage.sql
				.exec('SELECT reaction FROM pending_camo_purges WHERE reaction = ? LIMIT 1', target.reaction)
				.toArray()[0];
			const nextPurgeAt = pendingPurge ? now + PURGE_DEBOUNCE_MS : 0;

			this.ctx.storage.sql.exec(
				`INSERT INTO camo_targets (
					reaction,
					canonical_url,
					camo_url,
					discovered_at,
					purge_pending,
					next_purge_at,
					last_purge_attempt_at,
					last_purge_status
				)
					VALUES (?, ?, ?, ?, ?, ?, 0, 0)
					ON CONFLICT(reaction) DO UPDATE SET
						canonical_url = excluded.canonical_url,
						camo_url = excluded.camo_url,
						discovered_at = excluded.discovered_at,
						purge_pending = CASE
							WHEN excluded.purge_pending > 0 THEN camo_targets.purge_pending + excluded.purge_pending
							ELSE camo_targets.purge_pending
						END,
						next_purge_at = CASE
							WHEN excluded.next_purge_at > 0 THEN excluded.next_purge_at
							ELSE camo_targets.next_purge_at
						END`,
				target.reaction,
				target.canonicalUrl,
				target.camoUrl,
				now,
				pendingPurge ? 1 : 0,
				nextPurgeAt
			);

			if (pendingPurge) {
				this.ctx.storage.sql.exec(
					'DELETE FROM pending_camo_purges WHERE reaction = ?',
					target.reaction
				);
			}
		}
	}

	private async runCamoPurgeBatch(now: number) {
		const dueTargets = this.ctx.storage.sql
			.exec<CamoTargetRow>(
				`SELECT *
					FROM camo_targets
					WHERE purge_pending > 0 AND next_purge_at > 0 AND next_purge_at <= ?
					ORDER BY next_purge_at ASC
					LIMIT ${PURGE_BATCH_LIMIT}`,
				now
			)
			.toArray();

		if (dueTargets.length === 0) return;

		const slots = this.reservePurgeSlots(now, dueTargets.length);
		if (slots <= 0) return;

		const batch = dueTargets.slice(0, slots);
		const postponed = dueTargets.slice(slots);

		for (const target of postponed) {
			this.ctx.storage.sql.exec(
				'UPDATE camo_targets SET next_purge_at = ? WHERE reaction = ?',
				now + PURGE_BATCH_SPACING_MS,
				target.reaction
			);
		}

		for (const target of batch) {
			const attemptedAt = Date.now();
			this.ctx.storage.sql.exec(
				`UPDATE camo_targets SET last_purge_attempt_at = ?, next_purge_at = ?
					WHERE reaction = ? AND camo_url = ?`,
				attemptedAt,
				attemptedAt + PURGE_MIN_INTERVAL_MS,
				target.reaction,
				target.camo_url
			);
			const status = await purgeCamoUrl(target.camo_url);
			const retry = status === 0 || status === 408 || status === 429 || status >= 500;

			this.ctx.storage.sql.exec(
				`UPDATE camo_targets
					SET last_purge_status = ?
					WHERE reaction = ? AND camo_url = ?`,
				status,
				target.reaction,
				target.camo_url
			);
			if (!retry) {
				this.ctx.storage.sql.exec(
					`UPDATE camo_targets SET purge_pending = 0, next_purge_at = 0
						WHERE reaction = ? AND camo_url = ? AND purge_pending = ?`,
					target.reaction,
					target.camo_url,
					target.purge_pending
				);
			}
		}
	}

	private reservePurgeSlots(now: number, requested: number): number {
		const state = this.getGithubState();
		if (!state) return 0;

		let windowStartedAt = Number(state.purge_window_started_at || 0);
		let windowCount = Number(state.purge_window_count || 0);

		if (!windowStartedAt || now - windowStartedAt >= PURGE_WINDOW_MS) {
			windowStartedAt = now;
			windowCount = 0;
		}

		const remaining = Math.max(0, PURGE_WINDOW_LIMIT - windowCount);
		const slots = Math.min(requested, PURGE_BATCH_LIMIT, remaining);

		if (slots === 0) {
			const nextWindowAt = windowStartedAt + PURGE_WINDOW_MS;
			this.ctx.storage.sql.exec(
				`UPDATE camo_targets
					SET next_purge_at = ?
					WHERE purge_pending > 0 AND next_purge_at > 0 AND next_purge_at <= ?`,
				nextWindowAt,
				now
			);
		}

		this.ctx.storage.sql.exec(
			`UPDATE github_sync_state
				SET purge_window_started_at = ?,
					purge_window_count = ?,
					updated_at = ?
				WHERE key = ?`,
			windowStartedAt,
			windowCount + slots,
			now,
			GITHUB_STATE_KEY
		);

		return slots;
	}

	private async ensureAlarmScheduled() {
		const nextAlarmAt = this.getNextAlarmTime();
		const currentAlarm = await this.ctx.storage.getAlarm();

		if (!nextAlarmAt) {
			if (currentAlarm) await this.ctx.storage.deleteAlarm();
			return;
		}

		if (!currentAlarm || currentAlarm > nextAlarmAt + 1_000 || currentAlarm < Date.now()) {
			await this.ctx.storage.setAlarm(nextAlarmAt);
		}
	}

	private getNextAlarmTime(): number | null {
		const state = this.getGithubState();
		const times: number[] = [];
		const nextStatistics = this.statistics.snapshot.next_sync_at;
		if (nextStatistics) times.push(nextStatistics);
		const nextBadge = this.ctx.storage.sql.exec<{ next_at: number | null }>(
			`SELECT MIN(MIN(next_publish_at, throttled_until)) AS next_at
			FROM badge_publications WHERE throttled_until > 0`
		).toArray()[0]?.next_at;
		if (nextBadge) times.push(Number(nextBadge));

		if (state?.next_discovery_at && state.next_discovery_at > 0) {
			times.push(Number(state.next_discovery_at));
		}

		const nextPurge = this.ctx.storage.sql
			.exec<{ next_at: number | null }>(
				`SELECT MIN(next_purge_at) AS next_at
					FROM camo_targets
					WHERE purge_pending > 0 AND next_purge_at > 0`
			)
			.toArray()[0]?.next_at;

		if (nextPurge) times.push(Number(nextPurge));

		return times.length ? Math.min(...times) : null;
	}

	private getGithubState(): GithubSyncStateRow | null {
		return this.ctx.storage.sql
			.exec<GithubSyncStateRow>('SELECT * FROM github_sync_state WHERE key = ? LIMIT 1', GITHUB_STATE_KEY)
			.toArray()[0] ?? null;
	}

	private getCamoTarget(reactionId: string): CamoTargetRow | null {
		return this.ctx.storage.sql
			.exec<CamoTargetRow>('SELECT * FROM camo_targets WHERE reaction = ? LIMIT 1', reactionId)
			.toArray()[0] ?? null;
	}

	private clearGithubSyncState() {
		this.ctx.storage.sql.exec('DELETE FROM github_sync_state');
		this.ctx.storage.sql.exec('DELETE FROM camo_targets');
		this.ctx.storage.sql.exec('DELETE FROM pending_camo_purges');
	}

	private countReactions(): number {
		return Number(
			this.ctx.storage.sql
				.exec<{ value: number }>('SELECT COUNT(*) AS value FROM reactions')
				.toArray()[0]?.value ?? 0
		);
	}

	private countCamoTargets(): number {
		return Number(
			this.ctx.storage.sql
				.exec<{ value: number }>('SELECT COUNT(*) AS value FROM camo_targets')
				.toArray()[0]?.value ?? 0
		);
	}

	private readReactionIds(): string[] {
		return this.ctx.storage.sql
			.exec<ReactionIdRow>('SELECT id FROM reactions ORDER BY sort_order ASC')
			.toArray()
			.map((row) => row.id);
	}

	private getWidgetRow(): WidgetRow | null {
		return this.ctx.storage.sql.exec<WidgetRow>('SELECT * FROM widget LIMIT 1').toArray()[0] ?? null;
	}

	private readWidget(): PublicWidget | null {
		const row = this.getWidgetRow();
		if (!row) return null;

		const reactions = this.ctx.storage.sql
			.exec<ReactionRow>(
				`SELECT reactions.id, reactions.emoji, reactions.label, reactions.description, reactions.sort_order, counts.count
					FROM reactions
					LEFT JOIN counts ON counts.reaction = reactions.id
					ORDER BY reactions.sort_order ASC`
			)
			.toArray()
			.map(rowToReaction);

		return {
			doc: row.doc,
			returnUrl: row.return_url,
			verifyReferrer: Boolean(row.verify_referrer),
			badgeTheme: row.badge_theme,
			reactions,
			createdAt: row.created_at,
			updatedAt: row.updated_at
		};
	}

	private readReaction(reactionId: string): PublicWidgetReaction | null {
		const row = this.ctx.storage.sql
			.exec<ReactionRow>(
				`SELECT reactions.id, reactions.emoji, reactions.label, reactions.description, reactions.sort_order, counts.count
					FROM reactions
					LEFT JOIN counts ON counts.reaction = reactions.id
					WHERE reactions.id = ?
					LIMIT 1`,
				reactionId
			)
			.toArray()[0];

		return row ? rowToReaction(row) : null;
	}
}

function rowToReaction(row: ReactionRow): PublicWidgetReaction {
	return {
		id: row.id,
		emoji: row.emoji,
		label: row.label,
		description: row.description,
		count: Number(row.count ?? 0)
	};
}
