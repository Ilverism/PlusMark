// src/lib/Manager.ts
import { isBadgeTheme, type BadgeTheme } from "$lib/badge-theme";
import Reaction from "../Reaction.svelte";
import { buildGroupContentId, buildMarkdownSnippet, createReactionGroupId, createWidgetInput, normalizeDocId, normalizeReturnUrl, slugifyContentId } from "$lib/widget";
import type { MarkdownFormatting } from "$lib/widget";

const BADGE_PREFERENCE_KEY = "plusmark:include-badge";
const SOURCE_PREFERENCE_KEY = "plusmark:verify-referrer";

export type EmojiPickerAnchorRect = {
	top: number;
	right: number;
	bottom: number;
	left: number;
	width: number;
	height: number;
};

class Manager {

	isGenerating: boolean = $state(false);
	didStartGenerate: boolean = $state(false);
	contentId: string = $state("");
	reactionGroupId = $state("");
	verifyReferrer = $state(true);
	groupContentId = $derived(buildGroupContentId(this.contentId, this.reactionGroupId));
	private preferencesLoaded = false;
	private editTokens = new Map<string, string>();
	returnUrl: string = $state("");
	hasAttemptedGenerate = $state(false);
	groupIdInvalid = $derived(this.hasAttemptedGenerate && Boolean(normalizeDocId(this.contentId)) && !this.groupContentId);
	returnUrlInvalid = $derived(this.hasAttemptedGenerate && !normalizeReturnUrl(this.returnUrl));
	contentIdInvalid = $derived(this.hasAttemptedGenerate && !normalizeDocId(this.contentId));
	private contentIdEdited = false;
	includePlusMarkBadge: boolean = $state(true);
	includeSourceBadge: boolean = $state(true);
	formatting: MarkdownFormatting = $state('row');
	badgeTheme: BadgeTheme = $state('light');
	error: string = $state("");
	reactions: Reaction[] = $state([]);
	reactionEmojiEditing: Reaction | null = $state(null);
	reactionEmojiPickerPosition: EmojiPickerAnchorRect | null = $state(null);
	reactionEmojiPickerOpen: boolean = $derived.by(() => {
		
		// No reaction being edited -> False
		if (this.reactionEmojiEditing === null)
			return false;

		// Reactions list no longer contains the reaction being edited -> False
		if (!this.reactions.some(r => r.uuid === this.reactionEmojiEditing?.uuid)) {
			//this.reactionEmojiEditing = null;
			return false;
		}

		return true;

	});

	output: string = $state("");
	outputDisplayed: string = $derived.by(() => {

		if (this.output.length > 0)
			return this.output;

		if (this.error.length > 0)
			return this.error;

		return "Generation failed or is taking longer than expected...";

	});

	constructor() {

		// Initialize base reactions
		const thumbsUp = new Reaction();
		thumbsUp.emoji = "👍";
		thumbsUp.name = "Thumbs Up";
		thumbsUp.description = "I like this!";

		const thumbsDown = new Reaction();
		thumbsDown.emoji = "👎";
		thumbsDown.name = "Thumbs Down";
		thumbsDown.description = "I dislike this!";

		this.reactions.push(thumbsUp, thumbsDown);

	}

	/**
	 * Opens the emoji picker for a specific reaction, allowing the user to edit its emoji.
	 * 
	 * @param reaction - The Reaction for which to open the emoji picker
	 * @param buttonRect - The bounding rectangle of the emoji button, used for positioning the picker
	 */
	openEmojiPickerForReaction(reaction: Reaction, buttonRect: DOMRect) {

		// Already editing this reaction -> Close picker
		if (this.reactionEmojiEditing?.uuid === reaction.uuid) {
			this.reactionEmojiEditing = null;
			return;
		}

		this.reactionEmojiEditing = reaction;
		this.reactionEmojiPickerPosition = {
			top: buttonRect.top,
			right: buttonRect.right,
			bottom: buttonRect.bottom,
			left: buttonRect.left,
			width: buttonRect.width,
			height: buttonRect.height
		};

	}

	/**
	 * Closes the emoji picker and clears the editing state.
	 */
	closeEmojiPicker() {
		this.reactionEmojiEditing = null;
		this.reactionEmojiPickerPosition = null;
	}

	/**
	 * Adds a new reaction to the manager.
	 * 
	 * @param reaction - The new Reaction to add
	 */
	addReaction() {

		const newReaction = new Reaction();

		this.reactions.push(newReaction);
		this.markDirty();

		console.log(`Added new reaction: ${newReaction.name}`);

	}

	/**
	 * Removes a reaction from the manager by its UUID.
	 * 
	 * @param uuid - The UUID of the Reaction to remove
	 * @return true if the reaction was found and removed, false otherwise
	 */
	removeReactionByUUID(uuid: string): boolean {

		const index = this.reactions.findIndex(r => r.uuid === uuid);

		// Reaction not found -> False
		if (index == -1)
			return false;

		this.reactions.splice(index, 1);
		this.markDirty();
		return true;
		
	}

	/**
	 * Begins the HTML generation process for the current reactions.
	 * 
	 * @return The generated HTML code as a string
	 */
	setReturnUrl(value: string) {
		this.returnUrl = value;
		this.markDirty();

	}

	fillContentIdFromUrl(fromPaste = false) {
		if (!this.contentIdEdited || (fromPaste && !this.contentId.trim())) {
			this.contentId = normalizeReturnUrl(this.returnUrl) ? slugifyContentId(this.returnUrl) : "";
		}
	}

	setContentId(value: string) {
		// Preserve manual edits; only a URL paste may refill an empty ID.
		this.contentIdEdited = true;
		this.contentId = value;
		this.markDirty();
	}

	setReactionGroupId(value: string) {
		this.reactionGroupId = value;
		this.markDirty();
	}

	newReactionGroup() {
		this.setReactionGroupId(createReactionGroupId());
	}

	setVerifyReferrer(value: boolean) {
		this.verifyReferrer = value;
		this.markDirty();
		try {
			localStorage.setItem(SOURCE_PREFERENCE_KEY, String(value));
		} catch { /* The checkbox still works for this visit. */ }
	}

	loadPreferences() {
		if (this.preferencesLoaded) return;
		this.preferencesLoaded = true;
		this.reactionGroupId = createReactionGroupId();
		this.loadBadgePreference();
		try {
			// Preserve only the checkbox preference from the retired draft format.
			const oldDraft = localStorage.getItem('plusmark:reaction-draft:v1');
			if (localStorage.getItem(SOURCE_PREFERENCE_KEY) === null && oldDraft) {
				try {
					const draft = JSON.parse(oldDraft);
					if (typeof draft?.verifyReferrer === 'boolean') {
						localStorage.setItem(SOURCE_PREFERENCE_KEY, String(draft.verifyReferrer));
					}
				} catch { /* Ignore malformed retired drafts. */ }
			}
			localStorage.removeItem('plusmark:reaction-draft:v1');
			this.verifyReferrer = localStorage.getItem(SOURCE_PREFERENCE_KEY) !== 'false';
			// Retain existing edit access for this tab, without keeping tokens between sessions.
			for (const key of Object.keys(localStorage)) {
				if (!key.startsWith('plusmark:edit-token:')) continue;
				const token = localStorage.getItem(key);
				if (token) sessionStorage.setItem(key, token);
				localStorage.removeItem(key);
			}
		} catch {
			// Defaults and in-memory editing remain available when storage is blocked.
		}
	}

	loadBadgePreference() {
		try {
			this.includePlusMarkBadge = localStorage.getItem(BADGE_PREFERENCE_KEY) !== "false";
		} catch {
			// Storage may be blocked; keep the default enabled for this visit.
			this.includePlusMarkBadge = true;
		}
	}

	setIncludePlusMarkBadge(value: boolean) {
		this.includePlusMarkBadge = value;
		this.markDirty();
		try {
			localStorage.setItem(BADGE_PREFERENCE_KEY, String(value));
		} catch {
			// The checkbox still works for this visit when persistence is unavailable.
		}
	}

	setIncludeSourceBadge(value: boolean) {
		this.includeSourceBadge = value;
		this.markDirty();
	}

	setBadgeTheme(value: string) {
		if (!isBadgeTheme(value)) return;
		this.badgeTheme = value;
		this.markDirty();
	}

	setFormatting(value: string) {
		if (value !== 'row' && value !== 'column' && value !== 'table-no-desc' && value !== 'table-with-desc') return;
		this.formatting = value;
		this.markDirty();
	}

	markDirty() {
		this.didStartGenerate = false;
		this.output = "";
		this.error = "";
	}

	/**
	 * Begins the Markdown generation process for the current reactions.
	 */
	async generateStart(): Promise<string> {
		this.fillContentIdFromUrl();
		this.hasAttemptedGenerate = true;
		if (!normalizeReturnUrl(this.returnUrl) || !this.groupContentId
			|| this.reactions.some(reaction => !reaction.name.trim())) {
			return "";
		}

		// Flag as having started generation
		this.didStartGenerate = true;

		// Flag as generating
		this.isGenerating = true;
		this.output = "";
		this.error = "";

		const widgetInput = createWidgetInput({
			doc: this.groupContentId,
			returnUrl: this.returnUrl,
			reactions: this.reactions.map((reaction) => ({
				emoji: reaction.emoji,
				name: reaction.name,
				description: reaction.description
			}))
		});

		if (!widgetInput) {
			this.error = "Enter a valid return URL and at least one reaction.";
			this.generateFinish();
			return "";
		}

		this.contentId = normalizeDocId(this.contentId) ?? this.contentId;
		this.returnUrl = widgetInput.returnUrl;
		this.reactionGroupId = this.reactionGroupId.trim().toLowerCase();

		const editTokenStorageKey = `plusmark:edit-token:${widgetInput.doc}`;
		let editToken = this.editTokens.get(widgetInput.doc) ?? null;
		try { editToken = sessionStorage.getItem(editTokenStorageKey) ?? editToken; } catch { /* Storage may be blocked. */ }

		try {
			const response = await fetch("/api/widgets", {
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					...widgetInput,
					verifyReferrer: this.verifyReferrer,
					badgeTheme: this.badgeTheme,
					editToken
				})
			});

			const body = await response.json() as {
				widget?: typeof widgetInput & { badgeTheme: BadgeTheme };
				editToken?: string;
				error?: string;
			};

			if (!response.ok || !body.widget) {
				this.error = body.error ?? "Generation failed.";
				return "";
			}

			if (body.editToken) {
				this.editTokens.set(widgetInput.doc, body.editToken);
				try { sessionStorage.setItem(editTokenStorageKey, body.editToken); } catch { /* The generated badges still work. */ }
			}

			this.output = buildMarkdownSnippet(body.widget, window.location.origin, this.includePlusMarkBadge, this.includeSourceBadge, this.formatting);
			return this.output;
		} catch {
			this.error = "Generation failed. Check that the Worker preview server is running.";
			return "";
		} finally {
			this.generateFinish();
		}


	}

	/**
	 * Finishes the HTML generation process, resetting relevant state.
	 */
	generateFinish() {

		// Reset generation state
		this.isGenerating = false;

	}

}

const M = new Manager();
export default M as Manager;
