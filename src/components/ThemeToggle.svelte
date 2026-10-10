<script lang="ts">
	import { Moon, Sun } from '@lucide/svelte';
	import { mode, toggleMode } from 'mode-watcher';
	import { Button } from '$lib/components/ui/button';
</script>

<Button
	class="border-2 hover:dark:bg-card"
	variant="outline"
	size="icon"
	onclick={toggleMode}
	aria-label={mode.current === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
	title={mode.current === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
>
	<Sun class="hidden dark:block" />
	<Moon class="dark:hidden" />
</Button>
