import type { ServiceStatistics, ServiceTotals } from './service-statistics';

type Snapshot = ServiceTotals & { next_sync_at: number };

export class DocumentStatistics {
	constructor(private storage: DurableObjectStorage) {
		storage.transactionSync(() => {
			storage.sql.exec('CREATE TABLE IF NOT EXISTS statistics_reactions (id TEXT PRIMARY KEY)');
			storage.sql.exec('CREATE TABLE IF NOT EXISTS statistics (id INTEGER PRIMARY KEY CHECK (id = 1), reactions INTEGER NOT NULL, votes INTEGER NOT NULL, next_sync_at INTEGER NOT NULL)');
			const fresh = storage.sql.exec('INSERT OR IGNORE INTO statistics VALUES (1, 0, 0, 0) RETURNING id').toArray().length;
			// Existing badges establish the baseline; historical activity is not counted.
			if (fresh) storage.sql.exec('INSERT OR IGNORE INTO statistics_reactions SELECT id FROM reactions');
		});
	}

	recordReactions(ids: string[]) {
		let added = 0;
		for (const id of ids) added += this.storage.sql.exec('INSERT OR IGNORE INTO statistics_reactions VALUES (?) RETURNING id', id).toArray().length;
		if (added) this.increment(added, 0);
	}

	recordVote() { this.increment(0, 1); }

	private increment(reactions: number, votes: number) {
		this.storage.sql.exec('UPDATE statistics SET reactions = reactions + ?, votes = votes + ?, next_sync_at = CASE WHEN next_sync_at = 0 THEN ? ELSE next_sync_at END WHERE id = 1', reactions, votes, Date.now() + 60_000);
	}

	get snapshot(): Snapshot {
		return this.storage.sql.exec<Snapshot>('SELECT reactions, votes, next_sync_at FROM statistics WHERE id = 1').one();
	}

	async flush(id: string, namespace: DurableObjectNamespace | undefined) {
		const snapshot = this.snapshot;
		if (!snapshot.next_sync_at || snapshot.next_sync_at > Date.now()) return;
		try {
			if (!namespace) throw new Error('Missing SERVICE_STATISTICS binding');
			const stub = namespace.getByName('global') as unknown as Pick<ServiceStatistics, 'record'>;
			await stub.record(id, { reactions: snapshot.reactions, votes: snapshot.votes });
			// New votes may arrive while the snapshot is in flight.
			this.storage.sql.exec('UPDATE statistics SET next_sync_at = CASE WHEN reactions = ? AND votes = ? THEN 0 ELSE ? END WHERE id = 1', snapshot.reactions, snapshot.votes, Date.now() + 60_000);
		} catch {
			this.storage.sql.exec('UPDATE statistics SET next_sync_at = ? WHERE id = 1', Date.now() + 300_000);
		}
	}
}
