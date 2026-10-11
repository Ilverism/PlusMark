import { DurableObject } from 'cloudflare:workers';

export type ServiceTotals = { reactions: number; votes: number };

/** Receives cumulative snapshots, so retries and out-of-order delivery are harmless. */
export class ServiceStatistics extends DurableObject {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, reactions INTEGER NOT NULL, votes INTEGER NOT NULL)');
		ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS totals (id INTEGER PRIMARY KEY CHECK (id = 1), reactions INTEGER NOT NULL, votes INTEGER NOT NULL)');
		ctx.storage.sql.exec('INSERT OR IGNORE INTO totals VALUES (1, 0, 0)');
	}

	record(id: string, snapshot: ServiceTotals) {
		if (!id || ![snapshot.reactions, snapshot.votes].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Invalid statistics snapshot');
		this.ctx.storage.transactionSync(() => {
			const previous = this.ctx.storage.sql.exec<ServiceTotals>('SELECT reactions, votes FROM sources WHERE id = ?', id).toArray()[0] ?? { reactions: 0, votes: 0 };
			const reactions = Math.max(previous.reactions, snapshot.reactions);
			const votes = Math.max(previous.votes, snapshot.votes);
			if (reactions === previous.reactions && votes === previous.votes) return;
			this.ctx.storage.sql.exec('INSERT INTO sources VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET reactions = excluded.reactions, votes = excluded.votes', id, reactions, votes);
			this.ctx.storage.sql.exec('UPDATE totals SET reactions = reactions + ?, votes = votes + ? WHERE id = 1', reactions - previous.reactions, votes - previous.votes);
		});
	}

	getTotals(): ServiceTotals {
		return this.ctx.storage.sql.exec<ServiceTotals>('SELECT reactions, votes FROM totals WHERE id = 1').one();
	}
}
