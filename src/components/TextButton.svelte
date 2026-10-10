<!-- src/components/TextButton.svelte -->
<script lang="ts">
    import type { Snippet } from "svelte";


	type Props = {
		link?: string
		onclick?: () => void
		children: Snippet
		cLass?: string
	};
	let { link, onclick = ()=>{}, children, cLass }: Props = $props();

</script>


<!-- Got link, use anchor tag -->
{#if link}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a class="text-button {cLass}" href={link} target="_blank" rel="noopener noreferrer">
		{@render children?.()}
	</a>
	
<!-- Otherwise, use button tag -->
{:else}
	<button class="text-button {cLass}" onclick={onclick}>
		{@render children?.()}
	</button>
{/if}


<style lang="postcss">

	@reference "tailwindcss";
	@reference "../routes/layout.css";

	.text-button {
		@apply text-muted-foreground;
		@apply font-semibold;
		@apply decoration-0 underline-offset-2;


		/* @apply bg-red-500/10; */

		@apply h-fit;

		@apply flex items-center justify-center gap-2;
	}

</style>
