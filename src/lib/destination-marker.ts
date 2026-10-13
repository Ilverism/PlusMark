export function escapeXml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Shared by badge rendering and the generator preview. A visual cue, not proof of origin. */
export async function destinationColors(returnUrl: string): Promise<[string, string]> {
	const canonical = new URL(returnUrl).href;
	const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
	const hue = (hash[0] * 256 + hash[1]) % 360;
	const otherHue = (hue + 65 + hash[2] % 231) % 360;
	return [`hsl(${hue} 70% 45%)`, `hsl(${otherHue} 75% 65%)`];
}

export function destinationDot(colors: [string, string], x: number): string {
	return `<defs><linearGradient id="destination-gradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs>
<circle data-destination-marker="true" cx="${x}" cy="12" r="5" fill="url(#destination-gradient)" stroke="#374151" stroke-opacity="0.4" stroke-width="0.75" aria-hidden="true"/>`;
}
