<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Pathname } from '$app/types';
	import favicon from '$lib/assets/favicon.svg';
	import * as Tooltip from "$lib/components/ui/tooltip/index.js";
	import { Toaster } from '$lib/components/ui/sonner';
	import Manager from "$lib/Manager.svelte";
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import { ModeWatcher } from 'mode-watcher';
	import { fade } from 'svelte/transition';
	import notoSansLatin from '@fontsource-variable/noto-sans/files/noto-sans-latin-wght-normal.woff2?url';
	import './layout.css';

	let { children } = $props();
</script>

<ModeWatcher defaultMode="system" modeStorageKey="plusmark:theme" />
<Toaster position="bottom-right" closeButton duration={8000} />

<!-- Background -->
<div class="background-pattern" class:generating={Manager.isGenerating} aria-hidden="true"></div>
{#if !Manager.isGenerating}
	<div class="background" transition:fade={{duration: 500}}>
	</div>
{/if}

<svelte:head>
	<title>PlusMark</title>
	<link rel="icon" href={favicon} />
	<link rel="preload" href={notoSansLatin} as="font" type="font/woff2" crossorigin="anonymous" />
</svelte:head>

<Tooltip.Provider>
	{@render children()}
</Tooltip.Provider>

<div style="display:none">
	{#each locales as locale (locale)}
		<a
			href={resolve(localizeHref(page.url.pathname, { locale }) as Pathname)}
		>{locale}</a>
	{/each}
</div>


<style lang="postcss">

	@reference "tailwindcss";
	@reference "./layout.css";

	.background {
		@apply bg-background;
		@apply w-full h-full;
		@apply absolute;
	}

	.background-pattern {
		position: fixed;
		inset: 0;
		z-index: -1;
		overflow: hidden;
		pointer-events: none;
	}

	.background-pattern::before {
		content: '';
		/* One horizontal repeat of the 240px gradient at an 80 degree angle. */
		--stripe-repeat: calc(240px / 0.984807753);
		position: absolute;
		inset: 0 calc(-1 * var(--stripe-repeat)) 0 0;
		--bg-grad-color-1: var(--color-secondary);
		--bg-grad-color-2: var(--color-card);
		@apply bg-[repeating-linear-gradient(-80deg,var(--bg-grad-color-1),var(--bg-grad-color-1)_120px,var(--bg-grad-color-2)_120px,var(--bg-grad-color-2)_240px)];
		animation: slide-background 4s linear infinite paused;
	}

	.background-pattern.generating::before {
		animation-play-state: running;
	}

	@keyframes slide-background {
		from { transform: translateX(calc(-1 * var(--stripe-repeat))); }
		to { transform: translateX(0); }
	}

	@media (prefers-reduced-motion: reduce) {
		.background-pattern::before {
			animation: none;
		}
	}

	:global(body) {
		isolation: isolate;
		@apply relative;
		@apply flex;
		@apply min-h-screen;
	}

</style>
