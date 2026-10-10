<!-- src/components/ReactionCard.svelte -->
<script lang="ts">
	import { Input } from "$lib/components/ui/input";
	import Manager from "$lib/Manager.svelte";
	import { __reaction_description_placeholder, __reaction_name_placeholder } from "$lib/paraglide/messages";
	import { untrack } from "svelte";
	import { cubicOut } from "svelte/easing";
	import { fly } from "svelte/transition";
	import Reaction from "../Reaction.svelte";
	import ReactionCardEmoji from "./ReactionCardEmoji.svelte";

	type Props = {
		reaction: Reaction
	};
	let { 
		reaction
	}: Props = $props();

	const removeThisReaction = () => {
		Manager.removeReactionByUUID(reaction.uuid);
	};

	const reactionRemovalAllowed = $derived(Manager.reactions.length > 1);
	const nameInvalid = $derived(Manager.hasAttemptedGenerate && !reaction.name.trim());

	$effect(() => {

		reaction.description;
		reaction.name;

		// Close the emoji picker after editing any reaction's name or description
		untrack(() => {
			Manager.reactionEmojiPickerOpen = false;
		});

	});

</script>

<div
	class="reaciton-card-body"
	in:fly={{duration: 400, easing: cubicOut, x: 400, y: 0}}
	out:fly={{duration: 400, easing: cubicOut, x: 400, y: 0}}
>

	<!-- Emoji -->
	<ReactionCardEmoji reaction={reaction} />

	<!-- Content -->
	<div>
		<Input
			class="text-xl font-semibold mb-2"
			aria-label={__reaction_name_placeholder()}
			aria-invalid={nameInvalid}
			aria-describedby={nameInvalid ? `reaction-name-error-${reaction.uuid}` : undefined}
			bind:value={reaction.name}
			oninput={() => Manager.markDirty()}
			placeholder={__reaction_name_placeholder()}
		/>
		{#if nameInvalid}
			<p id={`reaction-name-error-${reaction.uuid}`} class="text-sm text-destructive mb-2" role="alert">Enter a reaction name.</p>
		{/if}
		<Input
			class="text-muted-foreground"
			aria-label={__reaction_description_placeholder()}
			bind:value={reaction.description}
			oninput={() => Manager.markDirty()}
			placeholder={__reaction_description_placeholder()}
		/>
	</div>

	<!-- Remove Button -->
	<button class="reaction-card-remove-button" onclick={removeThisReaction} disabled={!reactionRemovalAllowed}>
		<div>━</div>
	</button>

</div>



<style lang="postcss">
	@reference "tailwindcss";
	@reference "../routes/layout.css";

	.reaciton-card-body {

		@apply bg-card;
		@apply w-lg aspect-5/1;
		@apply rounded-xl;
		@apply px-6 py-4;

		@apply flex items-center gap-6;

		@apply drop-shadow-sm;

		@apply relative;

		@apply drop-shadow-xl drop-shadow-warm-shadow/15;
	}

	.reaction-card-remove-button {
		@apply absolute top-0 right-0 translate-x-1/2 -translate-y-1/2;
		@apply text-muted-foreground;
		@apply p-1;

		@apply w-6 aspect-square;

		@apply font-black;

		@apply bg-control;
		@apply rounded-full;

		@apply drop-shadow-lg;
		@apply drop-shadow-black/25;

		@apply flex items-center justify-center;
		
		@apply *:absolute;
		@apply *:pb-1;

		@apply enabled:hover:bg-destructive;
		@apply enabled:hover:text-accent-foreground;
		@apply enabled:hover:scale-125;
		@apply transition-transform;

		@apply select-none;
	}


</style>
