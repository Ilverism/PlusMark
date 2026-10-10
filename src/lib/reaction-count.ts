/** Truncate rather than round so the badge never overstates its count. */
export function formatReactionCount(count: number): string {
	for (const [unit, suffix] of [[1e12, 't'], [1e9, 'b'], [1e6, 'm'], [1e3, 'k']] as const) {
		if (count >= unit) return `${Math.floor(count / (unit / 10)) / 10}${suffix}`;
	}
	return String(count);
}
