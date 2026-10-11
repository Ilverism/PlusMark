import type { ServiceTotals } from './service-statistics';

// Matches the existing in-memory development reaction store; resets with Vite.
export const devStatistics: ServiceTotals = { reactions: 0, votes: 0 };
