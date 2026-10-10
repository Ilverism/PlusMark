<!-- src/components/ReactionAddButton.svelte -->
<script lang="ts">
	import Manager from "$lib/Manager.svelte";
	import { __add_reaction_button } from "$lib/paraglide/messages";
	import { Plus } from "@lucide/svelte";
</script>

<button class="reaction-add-button" onclick={() => Manager.addReaction()}>
	<Plus /> {__add_reaction_button()}
</button>


<style lang="postcss">
	@reference "tailwindcss";
	@reference "../routes/layout.css";

	.reaction-add-button {

		@apply mt-4;

		@apply text-foreground;
		@apply px-4 py-2;

		@apply w-fit;

		@apply font-semibold;

		@apply bg-control;
		@apply rounded-full;

		@apply drop-shadow-lg;
		@apply drop-shadow-black/25;

		@apply flex items-center justify-center gap-1;
		
		@apply hover:bg-accent;
		@apply hover:text-accent-foreground;
		@apply hover:scale-105;
		@apply transition-transform;

		@apply select-none;
	}
</style>