<script lang="ts">
	import * as Accordion from "$lib/components/ui/accordion/index.js";
	import {
		__instructions_header,
		__instructions_step_1,
		__instructions_step_2,
		__instructions_step_3
	} from "$lib/paraglide/messages";
    import { Handshake, Info, TriangleAlert } from "@lucide/svelte";
</script>

<aside class="instructions-panel" aria-label={__instructions_header()}>
	<Accordion.Root type="single" id="instructions-accordion" class="rounded-l-none">
		<Accordion.Item value="instructions">
			<Accordion.Trigger level={2} class="items-center focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
				<Info />
				<!-- {__instructions_header()} -->
				Usage Instructions
			</Accordion.Trigger>
			<Accordion.Content>
				<ol class="instructions-steps list-decimal">
					<!-- <li>{__instructions_step_1()}</li>
					<li>{__instructions_step_2()}</li>
					<li>{__instructions_step_3()}</li> -->
					<!-- <li>Add all of the <b>Reactions</b> you want and choose their icons.</li> -->
					<li>Use the <b>Add Reaction</b> button to add all of the new reactions you want, then choose their names and icons.</li>
					<li>Enter the <b>Return URL</b> where the user will be redirected to when clicked (should be the same page where the reactions are displayed).</li>
					<li>Enter the <b>Content ID</b> and <b>Reaction Group ID</b> that are used to identify the group of generated reactions.</li>
					<li>Click the <b>Generate</b> button.</li>
					<li>Click the <b>Copy</b> button, then paste the generated Markdown content into your document.</li>
				</ol>
			</Accordion.Content>
		</Accordion.Item>
	</Accordion.Root>

	<Accordion.Root type="single" id="instructions-accordion" class="rounded-l-none">
		<Accordion.Item value="instructions">
			<Accordion.Trigger level={2} class="items-center focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
				<TriangleAlert />
				Usage Warnings
			</Accordion.Trigger>
			<Accordion.Content>
				<ul class="instructions-steps list-disc!">
					<li>Anyone can duplicate and use any generated reactions in any document. This can be partially mitigated by keeping <b>Reject votes from other URLs</b> enabled.</li>
					<li>Reactions are vulnerable to being spammed. The same user using multiple browsers or devices can interact with the same reaction multiple times.</li>
				</ul>
			</Accordion.Content>
		</Accordion.Item>
	</Accordion.Root>

	<Accordion.Root type="single" id="instructions-accordion" class="rounded-l-none">
		<Accordion.Item value="instructions">
			<Accordion.Trigger level={2} class="items-center focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
				<Handshake />
				Usage Guidelines
			</Accordion.Trigger>
			<Accordion.Content>
				<ul class="instructions-steps list-disc!">
					<li>Do not use PlusMark to promote or vote on hateful, inappropriate, or harmful content.</li>
					<li>Do not use PlusMark to manipulate, harass, or mislead others.</li>
					<li>Do not use PlusMark excessively or in a way that could be considered spammy.</li>
				</ul>
			</Accordion.Content>
		</Accordion.Item>
	</Accordion.Root>

</aside>

<style lang="postcss">
	@reference "tailwindcss";
	@reference "../routes/layout.css";

	.instructions-panel {
		/* --card: var(--secondary);
		--muted: var(--secondary);
		--border: var(--surface-edge);
		--ring: var(--accent); */
		position: fixed;
		top: 6rem;
		left: 0;
		z-index: 20;
		width: min(20rem, calc(100vw - 1rem));
		border-radius: 0 var(--radius-2xl) var(--radius-2xl) 0;
		color: var(--card-foreground);
		@apply flex flex-col gap-4;
		@apply *:bg-(--card);

	}

	:global([data-slot="accordion"]) {
		box-shadow: 0 4px 16px var(--panel-shadow);
	}

	.instructions-steps {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-height: calc(100dvh - 12rem);
		overflow-y: auto;
		padding-left: 1.25rem;
		line-height: 1.5;
	}
</style>
