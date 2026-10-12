<!-- src/components/EmojiPicker.svelte -->
<script module lang="ts">
    import type { EmojiCategory, EmojiEntry } from "$lib/emoji";
	let cachedCategories: EmojiCategory[] = [];
</script>

<script lang="ts">
    import { onMount } from "svelte";
	import { Input } from "$lib/components/ui/input";
	import Manager from "$lib/Manager.svelte";
    import { fade, scale } from "svelte/transition";
    import { cubicInOut, cubicOut } from "svelte/easing";
    import { BadgeQuestionMark, LoaderCircle, Triangle } from "@lucide/svelte";

	let search = $state("");
	// The catalog is immutable; avoid creating a reactive proxy for every emoji.
	let categories = $state.raw(cachedCategories);
	let activeCategoryId = $state("reactions");
	let isLoadingEmoji = $state(false);
	let didFailToLoadEmojiFile = $state(false);
	let grid: HTMLDivElement;
	let emojiObserver: IntersectionObserver | undefined;

	// Keep native buttons for keyboard navigation, but only shape and paint emoji
	// near the scroll viewport. Rendering an entire category blocks on color fonts.
	function revealEmoji(node: HTMLButtonElement) {
		emojiObserver ??= new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					(entry.target as HTMLElement).style.contentVisibility = "visible";
					emojiObserver!.unobserve(entry.target);
				}
			}
		}, { root: node.parentElement, rootMargin: "44px 0px" });
		emojiObserver.observe(node);
		return () => emojiObserver?.unobserve(node);
	}

	const normalizedSearch = $derived(search.trim().toLowerCase());

	const activeCategory = $derived.by(() => {
		return categories.find((category) => category.id === activeCategoryId)
			?? categories[0]
			?? null;
	});

	const allEmojis = $derived.by(() => {
		return categories.filter((category) => category.label !== "Reactions").flatMap((category) => category.emojis);
	});

	const visibleEmojis = $derived.by(() => {
		if (normalizedSearch) {
			return allEmojis.filter((entry) => {
				return entry.keywords.includes(normalizedSearch);
			});
		}

		return activeCategory?.emojis ?? [];
	});

	const loadEmojiData = async () => {
		if (categories.length > 0 || isLoadingEmoji) return;

		isLoadingEmoji = true;

		try {
			const module = await import("$lib/generated/reaction-emojis.json");
			const loadedCategories = module.default as EmojiCategory[];

			cachedCategories = categories = loadedCategories;

			if (loadedCategories.some((category) => category.id === "reactions")) {
				activeCategoryId = "reactions";
			} else {
				activeCategoryId = loadedCategories[0]?.id ?? "";
			}

			didFailToLoadEmojiFile = false;
		} catch {
			didFailToLoadEmojiFile = true;
		} finally {
			isLoadingEmoji = false;
		}
	};

	const selectEmoji = (entry: EmojiEntry) => {

		const reaction = Manager.reactionEmojiEditing;
		if (!reaction) return;
		const currentEmoji = allEmojis.find(emoji => emoji.emoji === reaction.emoji);
		const currentName = reaction.name.trim().toLowerCase();
		if (!currentName || currentName === currentEmoji?.name.toLowerCase()) {
			reaction.name = entry.name.replace(/(^|[\s-])\p{L}/gu, word => word.toUpperCase());
		}
		reaction.emoji = entry.emoji;
		Manager.markDirty();
		search = "";
		
	};

	const selectCategory = (categoryId: string) => {
		grid.scrollTop = 0;
		activeCategoryId = categoryId;
		search = "";
	};

	let hasCategoriesAvailable = $derived(categories.length > 0);

	const REM_SCALE = 4.0;
	const pickerWidth = 96 * REM_SCALE;
	const pickerHeight = 80 * REM_SCALE;
	const pickerGap = 12;

	const anchorRect = $derived(Manager.reactionEmojiPickerPosition);
	const pickerPosition = $derived.by(() => {

		const ANCHOR_PADDING = 8;
		const ANCHOR_POS_DEFAULT = {top: 16, left: 16};

		// No anchor position available -> Default to top-left corner
		if (anchorRect === null)
			return ANCHOR_POS_DEFAULT;

		const preferredTop = anchorRect.top - pickerHeight - pickerGap;
		const fallbackTop = anchorRect.bottom + pickerGap;

		const top = (preferredTop >= ANCHOR_PADDING)
			? preferredTop
			: fallbackTop;

		const centeredLeft = anchorRect.left + (anchorRect.width / 2) - (pickerWidth / 2);

		const left = Math.min(
			Math.max(centeredLeft, ANCHOR_PADDING),
			window.innerWidth - pickerWidth - ANCHOR_PADDING
		);

		return {
			top,
			left
		};

	});

	onMount(() => {

		// Load emoji data when the component is mounted
		void loadEmojiData();

		// Close the emoji picker when the window is resized to prevent mispositioning
		const close = () => {
			Manager.closeEmojiPicker();
		};

		window.addEventListener("resize", close);
		return () => {
			window.removeEventListener("resize", close);
			emojiObserver?.disconnect();
		};
	
	});

</script>

<div
	id="emoji-picker-container"
	class="emoji-picker-container"
	style="top: {pickerPosition.top}px; left: {pickerPosition.left}px;"
>

	<div
		in:scale={{duration: 200, start: 0.67, easing: cubicOut}}
		class="emoji-picker-transition-layer"
	>

		<!-- Emoji Picker Content -->
		<div
			class="reaction-card-emoji-menu"
			role="dialog"
			aria-label="Choose an emoji"
		>
			<Input
				class="reaction-card-emoji-search"
				type="search"
				aria-label="Search emoji"
				placeholder="Search emoji"
				bind:value={search}
				oninput={() => { grid.scrollTop = 0; }}
			/>

			<!-- Category Tabs -->
			{#if hasCategoriesAvailable}
				<div class="reaction-card-emoji-categories" class:searching={!!normalizedSearch} aria-label="Emoji categories">
					{#each categories as category (category.id)}
						<button
							type="button"
							class="reaction-card-emoji-category group"
							class:reaction-card-emoji-category-active={!normalizedSearch && activeCategoryId === category.id}
							aria-label={category.label}
							title={category.label}
							onclick={() => selectCategory(category.id)}
						>
							<div class="reaction-card-emoji-category-icon">
								{category.icon}
							</div>
						</button>
					{/each}
				</div>
			{/if}

			<!-- Emoji Grid -->
			<div class="reaction-card-emoji-grid py-4" {@attach (node) => { grid = node; }}>
				{#if isLoadingEmoji}
					<div transition:fade={{duration: 400, easing: cubicInOut}} class="animate-spin text-secondary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
						<LoaderCircle size={64} strokeWidth={4}  />
					</div>
				{:else}
					{#each visibleEmojis as entry (entry.emoji)}
						<button
							{@attach revealEmoji}
							class="reaction-card-emoji-option group"
							aria-label={entry.name}
							title={entry.name}
							onclick={() => selectEmoji(entry)}
						>
							<div class="reaction-card-emoji-option-icon">
								{entry.emoji}
							</div>
						</button>

					{:else}
						<div class="text-card absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
							<BadgeQuestionMark size={64} strokeWidth={2}  />
							<span class="text-xl font-semibold">
								No matches found
							</span>
						</div>
					{/each}
				{/if}
			</div>

			<!-- Error Message -->
			{#if didFailToLoadEmojiFile}
				<p class="reaction-card-emoji-note">Could not load emoji list.</p>
			{/if}



		</div>
		

			<!-- Down arrow icon (Fill Illusion) -->
			<Triangle fill="var(--color-background)" class="absolute z-101 bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 text-background rotate-180" size={24} strokeWidth={4} />
			

		<!-- Down arrow icon (Bottom Stroke) -->
		<Triangle fill="var(--color-secondary)" class="absolute z-100 -bottom-2 left-1/2 -mb-0.75 -translate-x-1/2 translate-y-1/3 text-secondary rotate-180" size={24} strokeWidth={4} />

	</div>


</div>


<style lang="postcss">

	@reference "tailwindcss";
	@reference "../routes/layout.css";



	.emoji-picker-container {

		@apply select-none;

		@apply fixed;
		@apply z-50;

		@apply w-96 h-80;

		@apply flex items-start justify-center;

	}

	.emoji-picker-transition-layer {
		@apply relative;
		@apply w-full h-full;

		transform-origin: bottom center;
	}

	.reaction-card-emoji-menu {
		@apply overflow-visible;
		
		@apply absolute;

		@apply w-full h-full;
		@apply p-2;

		@apply rounded-lg;
		@apply bg-background;
		@apply shadow-sm;

		@apply z-100;

		@apply flex flex-col;
	
		@apply border-b-4 border-secondary;

	}

	.reaction-card-emoji-categories {

		@apply pointer-events-none;
		@apply **:pointer-events-auto;
		
		@apply bg-secondary;
		@apply rounded-md;
		@apply w-fit mx-auto;
		@apply px-2 py-1;
		@apply flex items-center justify-center gap-1;
		@apply mt-2 mb-1;

		@apply relative;
	}

	.reaction-card-emoji-categories::before {
		content: "";
		position: absolute;

		/* width: 1.75rem; */
		@apply w-9;
		@apply aspect-square;
		corner-shape: squircle;
		border-radius: 9999px;

		background: var(--selection-highlight);
		pointer-events: none;

		position-visibility: anchors-valid;
		position-anchor: --category-indicator;
		left: anchor(center);
		top: anchor(center);
		transform: translate(-50%, -50%);

		transition:
			left 160ms ease,
			top 160ms ease;
	}

	.reaction-card-emoji-categories.searching::before {
		display: none;
	}

	.reaction-card-emoji-category {
		position: relative;
		z-index: 1;
	}

	.reaction-card-emoji-category-icon {
		@apply text-shadow-2xs text-shadow-black/30;
		@apply group-hover:scale-150;
		@apply transition-transform;

		@apply text-2xl;

		@apply relative;
		@apply z-2;
	}

	.reaction-card-emoji-categories:not(:hover)
		.reaction-card-emoji-category-active {
		anchor-name: --category-indicator;
	}
	.reaction-card-emoji-category:hover {
		anchor-name: --category-indicator;
	}

	.reaction-card-emoji-grid {
		@apply h-full;
		@apply overflow-y-auto overflow-x-hidden;
		@apply relative;
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		
		@apply gap-1;
		
		@apply mt-2;
		
		border-bottom: 0;
		border-right: 0;
	}

	.reaction-card-emoji-option {
		content-visibility: hidden;

		@apply relative;

		@apply w-10 aspect-square;


		@apply bg-popover;
		@apply rounded-full;

		@apply border-2;
		@apply border-secondary;
		@apply hover:border-accent-foreground;
		@apply hover:bg-accent;

	}

	.reaction-card-emoji-option-icon {

		@apply absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2;

		@apply text-xl;

		@apply group-hover:scale-150;
		@apply group-hover:-translate-y-[calc(50%+0.5rem)];
		@apply transition-transform duration-150;

		@apply group-hover:animate-wiggle;

		transform-origin: center;
		/* Let the browser promote only the hovered emoji, not the entire catalog. */

	}

	.reaction-card-emoji-note {
		margin: 0;
		color: var(--foreground);
		font-size: 0.75rem;
	}

	.reaction-card-emoji-note {
		margin-top: 0.5rem;
	}


</style>
