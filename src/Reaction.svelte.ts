// src/Reaction.svelte.ts
export default class Reaction {

	emoji: string = $state("❔");
	name: string = $state("");
	description: string = $state("");

	uuid: string = crypto.randomUUID();

}
