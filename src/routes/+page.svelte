<!-- src/routes/+page.svelte -->
<script lang="ts">
    import Manager from "$lib/Manager.svelte";
    import { __meta_description, __support, __tagline } from "$lib/paraglide/messages";
    import { Coffee, ExternalLink } from "@lucide/svelte";
    import { flip } from "svelte/animate";
    import { cubicOut } from "svelte/easing";
    import EmojiPicker from "../components/EmojiPicker.svelte";
    import Instructions from "../components/Instructions.svelte";
    import LanguagePicker from "../components/LanguagePicker.svelte";
    import MainCard from "../components/MainCard.svelte";
    import ReactionAddButton from "../components/ReactionAddButton.svelte";
    import ReactionCard from "../components/ReactionCard.svelte";
    import TextButton from "../components/TextButton.svelte";
    import ThemeToggle from "../components/ThemeToggle.svelte";
    import ServiceStatistics from "../components/ServiceStatistics.svelte";
    import M from "$lib/Manager.svelte";
    import { fly } from "svelte/transition";
</script>

<svelte:head>
	<meta name="description" content={__meta_description()} />
</svelte:head>

<div class="page-body noto-sans w-full pt-28 lg:pt-0">

	<!-- Service Statistics -->
	<ServiceStatistics />

	<!-- Instructions -->
	<Instructions />

	<div class="page-content">

		<!-- Header & Tagline -->
		<div class="min-w-2xl min-h-58">
			{#if M.reactions.length <= 3}
				<div transition:fly={{duration: 400, easing: cubicOut, x: -400, y: 0}} class="page-header">
					<h2 class="ml-4 underline decoration-dotted decoration-1 underline-offset-8">PlusMark</h2>
					<p class="text-foreground mt-4 px-4">
						{__tagline()}
					</p>
				</div>
			{/if}
		</div>

		<div class="page-content-inner">

			<!-- Main Card -->
			<MainCard />

			<!-- Reaction Items -->
			<div class="reaction-items" class:reaction-items-disabled={Manager.isGenerating}>

				<div class="reaction-items-list">
					{#each Manager.reactions as reaction (reaction.uuid)}
						<div animate:flip={{duration: 300, easing: cubicOut}}>
							<ReactionCard {reaction} />
						</div>
					{:else}
						<p>No reactions yet!</p>
					{/each}
				</div>

				<!-- Add Reaction Button -->
				<ReactionAddButton />

			</div>

		</div>

	</div>

	<!-- Corner Buttons -->
	<div class="fixed top-4 right-4 z-20"><ThemeToggle /></div>
	<TextButton link="https://github.com" cLass="absolute top-4 left-4 flex gap-2 group hover:scale-105">
		<!-- <SiGithub size={18} />
		<span>GitHub</span> -->

		<img src="/PlusMark-logo.svg" alt="PlusMark Logo" width="208" height="128" class="main-card-logo w-16"/>

		<!-- ... -->
		<div class="flex flex-col items-start">
			<span class="text-foreground text-base font-black group-hover:underline">PlusMark</span>

			<!-- Not Hovering -> Show Version & Date -->
			<span class="text-xs text-foreground font-light group-hover:hidden">ver. 2026-10.11 (Beta)</span>
			<span class="text-xs text-foreground font-light not-group-hover:hidden flex gap-1 items-center">
				<ExternalLink  size={16}/>
				Open in GitHub</span>
		</div>

	</TextButton>

	<!-- Support Button -->
	<!-- <TextButton link="https://github.com" cLass="absolute bottom-4 left-4 hover:underline">
		<Coffee size={18} />
		<span>{__support()} (Ko-fi)</span>
	</TextButton>
	<LanguagePicker cLass="absolute bottom-4 right-4" /> -->

	<!-- Emoji Picker -->
	{#if Manager.reactionEmojiPickerOpen}
		<EmojiPicker />
	{/if}

</div>



<style lang="postcss">
	@reference "tailwindcss";
	@reference "./layout.css";

	.main-card-logo {
		filter: var(--logo-filter);
	}

	.page-body {
		@apply relative;

		@apply flex items-center justify-center;
	}

	.page-content {
		@apply flex flex-col items-start gap-12;
	}

	.page-content-inner {
		@apply flex items-center gap-6;
	}


	.reaction-items {
		@apply flex-1;

		@apply flex flex-col items-center gap-4;

		@apply transition-all duration-400;
	}
	.reaction-items-list {

		@apply flex-1;

		@apply flex flex-col items-center gap-4;

		/* @apply scroll-fade;

		@apply max-h-[50dvh];
		@apply h-[50dvh];
		@apply overflow-y-auto;
		@apply overflow-x-clip;
		@apply p-32;
		@apply -m-32; */

	}

	.reaction-items-disabled {
		@apply opacity-50;
		@apply pointer-events-none;
		@apply select-none;
	}


	h2 {
		@apply text-9xl;
		@apply font-semibold;
		@apply text-foreground;
	}

	p {
		@apply text-3xl;
		@apply font-light;
		@apply leading-snug;
		@apply max-w-2xl;
		@apply text-foreground;
	}


</style>
