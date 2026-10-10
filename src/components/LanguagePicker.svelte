<!-- src/components/LanguagePicker.svelte -->
<script lang="ts">
    import { getLocale, locales, setLocale } from '$lib/paraglide/runtime';
    import { Languages } from "@lucide/svelte";

	type Props = {
		cLass?: string;
	};
	let { cLass }: Props = $props();

	const setNewLocale = (e: Event) => {
		const target = e.target as HTMLSelectElement;
		const newLocaleTarget = target.value;

		if (!newLocaleTarget || newLocaleTarget === getLocale()) {
			console.log(`Locale is already set to ${newLocaleTarget}, not changing.`);
			return;
		}

		const newLocale = newLocaleTarget as typeof locales[number];
		console.log(`Setting locale to ${newLocale}`);

		setLocale(newLocale);
	};

</script>

<select id="language-picker" class="language-picker {cLass}" onchange={setNewLocale} value={getLocale()}>
	
	{#each locales as locale (locale)}
		<option value={locale}>
			<Languages size={24} class="bg-red-500 w-16 aspect-square"/>
			{locale}
		</option>
	{/each}

</select>

<style lang="postcss">
	@reference "tailwindcss";
	@reference "../routes/layout.css";

	.language-picker {
		@apply cursor-pointer;
		@apply text-muted-foreground;
		@apply font-semibold;
		@apply decoration-0 underline-offset-2;
		@apply hover:underline;

		@apply h-fit;

		@apply flex items-center justify-center gap-2;

		@apply accent-green-500;
	}

	option {
		@apply bg-card;
	}

</style>
