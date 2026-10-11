<script lang="ts">
	import { onMount } from 'svelte';
	import { getLocale } from '$lib/paraglide/runtime';

	let totals = $state<{ reactions: number; votes: number } | null>(null);
	const formatter = $derived(new Intl.NumberFormat(getLocale(), { notation: 'compact', maximumFractionDigits: 1 }));

	onMount(() => {
		const controller = new AbortController();
		let pending = false;
		async function refresh() {
			if (pending || document.hidden) return;
			pending = true;
			try {
				const response = await fetch('/api/statistics', { signal: controller.signal });
				if (!response.ok) return;
				const data = await response.json();
				if ([data.reactions, data.votes].every(value => Number.isSafeInteger(value) && value >= 0)) totals = data;
			} catch { /* Retain the last available totals during temporary outages. */ }
			finally { pending = false; }
		}
		void refresh();
		const interval = setInterval(() => void refresh(), 60_000);
		return () => { controller.abort(); clearInterval(interval); };
	});
</script>

<div class="service-statistics absolute inset-x-4 top-20 text-center text-xs text-foreground/70 tabular-nums lg:inset-x-64 lg:top-5 lg:text-sm"
	title="Activity since statistics tracking launched. Votes include additions and removals; totals update periodically.">
	<span><b>{totals ? formatter.format(totals.reactions) : '—'}</b> Reactions Generated</span>
	<span aria-hidden="true"> • </span>
	<span><b>{totals ? formatter.format(totals.votes) : '—'}</b> Votes Submitted</span>
</div>
