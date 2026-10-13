<!-- src/components/MainCard.svelte -->
<script lang="ts">

	import { Button } from "$lib/components/ui/button";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import * as Field from "$lib/components/ui/field";
	import { Input } from "$lib/components/ui/input";
	import * as NativeSelect from "$lib/components/ui/native-select/index.js";
	import * as Tooltip from "$lib/components/ui/tooltip/index.js";
	import { destinationColors } from "$lib/destination-marker";
	import Manager from "$lib/Manager.svelte";
	import { __generate_HTML_button } from "$lib/paraglide/messages";
	import { normalizeReturnUrl, slugifyContentId } from "$lib/widget";
	import { ArrowBigDown, CirclePlay, CircleQuestionMark, CircleX, Copy, RotateCw } from "@lucide/svelte";
	import { flushSync, onMount } from "svelte";
	import { backIn, backOut } from "svelte/easing";
	import { scale, slide } from "svelte/transition";

	onMount(() => Manager.loadPreferences());

	let copyStatus = $state<{ output: string; message: string } | null>(null);

	async function copyOutput() {
		const output = Manager.output;
		if (!output || Manager.isGenerating) return;

		try {
			await navigator.clipboard.writeText(output);
			copyStatus = { output, message: 'Copied!' };
		} catch {
			copyStatus = { output, message: 'Unable to copy. Select and copy the text manually.' };
		}
	}

</script>

{#snippet questionIndicator(message: string)}

	<Tooltip.Root>
		<Tooltip.Trigger>
			<CircleQuestionMark
				strokeWidth={3}
				class="text-muted dark:text-muted-foreground shrink-0 size-7"
				title="The URL to return to after someone clicks a reaction badge."
			/>
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>{message}</p>
		</Tooltip.Content>
	</Tooltip.Root>

{/snippet}

<div class="main-card">

	<!-- Input Fields -->
	<Field.Group class="main-card-fields mt-4 gap-6">

		<!-- Return URL -->
		<Field.Field class="gap-1">
			<Field.Label for="return-url" class="text-base font-semibold">Return URL</Field.Label>
			<div class="flex items-center gap-4">
				<Input
					id="return-url"
					type="url"
					class="font-semibold"
					value={Manager.returnUrl}
					aria-invalid={Manager.returnUrlInvalid}
					aria-describedby={Manager.returnUrlInvalid ? 'return-url-error' : undefined}
					oninput={(event) => {
						Manager.setReturnUrl(event.currentTarget.value);
						if (event instanceof InputEvent && event.inputType === 'insertFromPaste') Manager.fillContentIdFromUrl(true);
					}}
					onblur={() => flushSync(() => Manager.fillContentIdFromUrl())}
					placeholder="https://example.com/my-markdown-document"
				/>
				<!-- <Tooltip.Root>
					<Tooltip.Trigger>
						<CircleQuestionMark
							strokeWidth={3}
							class="text-muted-foreground shrink-0 size-7"
							title="The URL to return to after someone clicks a reaction badge."
						/>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>The URL the user is directed to after clicking a reaction badge. This should be the URL of the page where your Markdown content is hosted.</p>
					</Tooltip.Content>
				</Tooltip.Root> -->
				{@render questionIndicator("The URL the user is directed to after clicking a reaction badge. This should be the URL of the page where your Markdown content is hosted.")}
			</div>
		</Field.Field>

		{#if Manager.returnUrlInvalid}
			<p id="return-url-error" class="text-sm text-destructive" role="alert">Enter a valid http:// or https:// URL.</p>
		{/if}

		<!-- Content ID & Reaction Group ID -->
		<Field.Field class="gap-1">
			<Field.Label for="content-id" class="text-base font-semibold">Content ID <small class="font-normal">&</small> Reaction Group ID</Field.Label>
			<div class="flex items-center">
				<Input
					id="content-id"
					type="text"
					class="font-semibold"
					value={Manager.contentId}
					aria-invalid={Manager.contentIdInvalid}
					aria-describedby={Manager.contentIdInvalid ? 'content-id-error' : undefined}
					oninput={(event) => Manager.setContentId(event.currentTarget.value)}
					placeholder="my-markdown-document"
				/>

				<div class="bg-background flex rounded-lg mx-3">

					<!-- Generate From URL -->
					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button variant="link" disabled={Manager.isGenerating || !normalizeReturnUrl(Manager.returnUrl)} onclick={() => Manager.setContentId(slugifyContentId(Manager.returnUrl))} aria-label="Generate Content ID from Return URL" title="Generate Content ID from Return URL">
								<ArrowBigDown strokeWidth={3} />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>Generate a Content ID from the Return URL.</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<!-- Clear Content ID -->
					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button variant="link" disabled={Manager.isGenerating} onclick={() => Manager.setContentId('')} aria-label="Clear Content ID" title="Clear Content ID">
								<CircleX strokeWidth={3} />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>Clear the Content ID.</p>
						</Tooltip.Content>
					</Tooltip.Root>

				</div>

				{@render questionIndicator("Content ID: A unique identifier for the content these reactions belong to.")}
			</div>

			<div class="flex items-center gap-0">
				<Input
					id="reaction-group-id"
					value={Manager.reactionGroupId}
					disabled={Manager.isGenerating}
					aria-invalid={Manager.groupIdInvalid}
					aria-describedby="reaction-group-help reaction-group-error"
					oninput={(event) => Manager.setReactionGroupId(event.currentTarget.value)}
					placeholder="abcd0123 (optional)"
				/>

				<div class="bg-background flex rounded-lg mx-3">

					<!-- Rotate Group ID -->
					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button variant="link" disabled={Manager.isGenerating} onclick={() => Manager.newReactionGroup()} aria-label="Randomize reaction group ID" title="Randomize reaction group ID">
								<RotateCw strokeWidth={3} />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>Randomize the Reaction Group ID.</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<!-- Clear Group ID -->
					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button variant="link" disabled={Manager.isGenerating} onclick={() => Manager.setReactionGroupId('')} aria-label="Clear reaction group ID" title="Clear reaction group ID">
								<CircleX strokeWidth={3} />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>Clear the Reaction Group ID.</p>
						</Tooltip.Content>
					</Tooltip.Root>

				</div>

				{@render questionIndicator("Reaction Group ID: A unique identifier for the group of reactions.")}

			</div>
			<p id="reaction-group-error" class="text-sm text-destructive" role="alert">{Manager.groupIdInvalid ? 'Use up to 32 letters, numbers, or single separating dashes. Shorten the Content ID so the combined ID fits within 120 characters.' : ''}</p>
		</Field.Field>
		{#if Manager.contentIdInvalid}
			<p id="content-id-error" class="text-sm text-destructive" role="alert">Enter a Content ID containing letters or numbers.</p>
		{/if}

		<!-- Secondary Options -->
		<Field.Group class="gap-0.5! **:data-[slot='field-label']:before:content-['•'] **:before:text-muted **:dark:before:text-muted-foreground">

			<!-- Check reaction source -->
			<Field.Field class="gap-1">
				<div class="flex items-center gap-2">
					<Checkbox id="verify-referrer" checked={Manager.verifyReferrer} aria-describedby="verify-referrer-help"
						onCheckedChange={(checked) => Manager.setVerifyReferrer(checked)} />
					<Field.Label for="verify-referrer" class="text-base font-semibold">Reject votes from other URLs</Field.Label>
				</div>
			</Field.Field>

			<!-- Include ID tag -->
			<Field.Field orientation="horizontal" class="w-fit gap-2 pt-2">
				<Checkbox id="include-id-tag" checked={Manager.includeIdTag}
					onCheckedChange={(checked) => Manager.setIncludeIdTag(checked)} />
				<Field.Label for="include-id-tag" class="text-base font-semibold">Include ID tag</Field.Label>
			</Field.Field>

			<!-- Include source badge -->
			<Field.Field orientation="horizontal" class="w-fit gap-2 pt-2">
				<Checkbox id="include-source-badge" checked={Manager.includeSourceBadge}
					onCheckedChange={(checked) => Manager.setIncludeSourceBadge(checked)} />
				<Field.Label for="include-source-badge" class="text-base font-semibold">Include source badge</Field.Label>
			</Field.Field>

			<!-- Include PlusMark badge -->
			<Field.Field orientation="horizontal" class="w-fit gap-2 pt-2">
				<Checkbox id="include-badge" checked={Manager.includePlusMarkBadge}
					onCheckedChange={(checked) => Manager.setIncludePlusMarkBadge(checked)} />
				<Field.Label for="include-badge" class="text-base font-semibold">Include PlusMark badge</Field.Label>
			</Field.Field>

		</Field.Group>

		<!-- Formatting Options -->
		<Field.Group class="gap-1!">

			<Field.Field orientation="vertical" class="gap-1">
				<Field.Label for="formatting" class="text-base font-semibold">Formatting</Field.Label>
				<NativeSelect.Root
					id="formatting"
					value={Manager.formatting}
					disabled={Manager.isGenerating}
					onchange={(event) => Manager.setFormatting(event.currentTarget.value)}
				>
					<NativeSelect.Option value="row">Row</NativeSelect.Option>
					<NativeSelect.Option value="column">Column</NativeSelect.Option>
					<NativeSelect.Option value="table-no-desc">Table (No descriptions)</NativeSelect.Option>
					<NativeSelect.Option value="table-with-desc">Table (With descriptions)</NativeSelect.Option>
				</NativeSelect.Root>
			</Field.Field>

			<Field.Field orientation="vertical" class="gap-1 mt-3">
				<Field.Label for="badge-theme" class="text-base font-semibold">Badge Theme</Field.Label>
				<NativeSelect.Root
					id="badge-theme"
					value={Manager.badgeTheme}
					disabled={Manager.isGenerating}
					onchange={(event) => Manager.setBadgeTheme(event.currentTarget.value)}
				>
					<NativeSelect.Option value="light">Light</NativeSelect.Option>
					<NativeSelect.Option value="dark">Dark</NativeSelect.Option>
					<NativeSelect.Option value="soft-dark">Soft Dark</NativeSelect.Option>
				</NativeSelect.Root>
			</Field.Field>

		</Field.Group>

	</Field.Group>

	<!-- Generated HTML -->
	{#if Manager.didStartGenerate}
		<div
			class="main-card-generated-container"
			in:slide={{duration: 400, delay: 600 }}
			out:slide={{duration: 400}}
		>
			<!-- <hr class="border-secondary border-2 drop-shadow-xs drop-shadow-black/30 mt-4"/> -->
			<!-- <h3 class="ml-4 underline mt-4">Output</h3> -->
			<div class="main-card-generated">
				<code class="main-card-generated-code">
				{Manager.outputDisplayed}
				</code>
				<div class="flex shrink-0 items-center justify-end gap-2 pt-1">
					{#if Manager.output && Manager.generatedReturnUrl}
						{#await destinationColors(Manager.generatedReturnUrl) then colors}
							<Tooltip.Root>
								<Tooltip.Trigger aria-label="Return URL identifier" class="mr-auto flex size-8 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-ring">
									<svg aria-hidden="true" width="24" height="24" viewBox="0 0 12 12">
										<defs>
											<linearGradient id="destination-preview-gradient" x1="0" y1="0" x2="1" y2="1">
												<stop stop-color={colors[0]} />
												<stop offset="1" stop-color={colors[1]} />
											</linearGradient>
										</defs>
										<circle cx="6" cy="6" r="5" fill="url(#destination-preview-gradient)" stroke="#374151" stroke-opacity="0.4" stroke-width="0.75" />
									</svg>
								</Tooltip.Trigger>
								<Tooltip.Content role="tooltip">
									<p>This gradient will appear inside your displayed badges. It helps viewers confirm that the reactions correspond to the correct Return URL when the "Include source badge" option is enabled.</p>
								</Tooltip.Content>
							</Tooltip.Root>
						{:catch}
							<span class="mr-auto text-xs text-muted-foreground">Identifier preview unavailable.</span>
						{/await}
					{/if}
					<span class="text-xs text-muted-foreground" role="status">
						{copyStatus?.output === Manager.output ? copyStatus.message : ''}
					</span>
					<Button variant="link" size="sm" onclick={copyOutput} disabled={Manager.isGenerating || !Manager.output}>
						<Copy data-icon="inline-start" />
						Copy
					</Button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Generate Button -->
	{#if !Manager.didStartGenerate}
		<button
			class="main-card-generate-button"
			onclick={() => void Manager.generateStart()}
			in:scale={{duration: 400, easing: backOut }}
			out:scale={{duration: 400, easing: backIn }}
		>
			<CirclePlay />
			{__generate_HTML_button()}
		</button>
	{/if}

</div>



<style lang="postcss">

	@reference "tailwindcss";
	@reference "../routes/layout.css";

	.main-card {
		@apply px-6 pt-3;
		/* @apply pb-10; */

		@apply bg-card;
		@apply rounded-xl;
		@apply w-lg h-fit;

		@apply drop-shadow-xl drop-shadow-warm-shadow/15;

		@apply relative;

		@apply border-b-4 border-surface-edge;
	}

	:global(.main-card-fields) {
		@apply pb-12;
	}

	.main-card-generate-button {

		@apply absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2;
		@apply ring-4 ring-surface-edge;

		@apply px-4 py-2;

		@apply w-fit;

		@apply font-semibold;

		@apply bg-control;
		@apply rounded-full;
		
		@apply flex items-center justify-center gap-2;
		
		@apply hover:bg-accent;
		@apply hover:text-accent-foreground;
		@apply hover:scale-105;
		@apply transition-transform;

		@apply select-none;
	}

	/* .main-card-logo {
		@apply absolute top-0 right-0 translate-x-1/2 -translate-y-1/2;
		@apply opacity-50;
		@apply scale-25;
		@apply drop-shadow-lg drop-shadow-black/30;
	} */

	.main-card-generated-container {
		@apply overflow-hidden;
	}

	.main-card-generated {
		@apply flex flex-col;

		@apply rounded-md;
		@apply h-48;

		@apply mt-4 mb-4;
		@apply px-4 py-2;
		@apply bg-popover;
	}

	.main-card-generated-code {
		@apply block min-h-0 flex-1;
		@apply overflow-y-scroll;
		@apply scrollbar-thin;
		@apply scrollbar-thumb-secondary;

		@apply wrap-anywhere;
		@apply select-all;
	}


</style>
