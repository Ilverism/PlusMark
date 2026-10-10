export const BADGE_TRAFFIC_WINDOW_MS = 60_000;
export const BADGE_TRAFFIC_LIMIT = 300;
export const BADGE_REFRESH_INTERVAL_MS = 60_000;

export type BadgePublication = {
	window_started_at: number;
	window_count: number;
	throttled_until: number;
	published_count: number;
	next_publish_at: number;
};

// The stored count is independent of this public snapshot. Both votes and undo
// actions count toward traffic. Low-traffic windows stop extending the cooldown.
export function advanceBadgePublication(
	previous: BadgePublication | null, count: number, now: number, isVote: boolean
): BadgePublication {
	const state = previous ? { ...previous } : {
		window_started_at: now, window_count: 0, throttled_until: 0,
		published_count: count, next_publish_at: 0
	};
	const wasThrottled = state.throttled_until > 0;
	if (now - state.window_started_at >= BADGE_TRAFFIC_WINDOW_MS) {
		state.window_started_at = now;
		state.window_count = 0;
	}
	if (isVote && ++state.window_count >= BADGE_TRAFFIC_LIMIT) {
		state.throttled_until = now + BADGE_TRAFFIC_WINDOW_MS;
	}
	if (state.throttled_until <= now) {
		state.throttled_until = 0;
		state.next_publish_at = 0;
		state.published_count = count;
	} else if (!wasThrottled || now >= state.next_publish_at) {
		state.published_count = count;
		state.next_publish_at = now + BADGE_REFRESH_INTERVAL_MS;
	}
	return state;
}

export function badgeRefreshAt(state: BadgePublication): number {
	return state.throttled_until ? Math.min(state.next_publish_at, state.throttled_until) : 0;
}
