/** Fetch only from the fixed favicon provider, never from a user-supplied host. */
export async function sourceFavicon(returnUrl: string, cache?: Cache, fetcher: typeof fetch = fetch): Promise<string | null> {
	const hostname = new URL(returnUrl).hostname;
	if (!hostname.includes('.') || hostname.includes(':') || /^[\d.]+$/.test(hostname)
		|| /\.(localhost|local|internal|test|invalid|example)$/.test(hostname)) return null;
	const key = new Request(`https://plusmark-favicon-cache.invalid/v1/${encodeURIComponent(hostname)}`);
	const cached = await cache?.match(key).catch(() => undefined);
	if (cached) return (await cached.text()) || null;
	let icon: string | null = null;
	try {
		let url = new URL('https://www.google.com/s2/favicons');
		url.search = new URLSearchParams({ domain: hostname, sz: '32' }).toString();
		const signal = AbortSignal.timeout(3000);
		for (let redirects = 0; redirects <= 2; redirects++) {
			const response = await fetcher(url, { redirect: 'manual', signal });
			if ([301, 302, 303, 307, 308].includes(response.status)) {
				await response.body?.cancel();
				const location = response.headers.get('location');
				if (!location) break;
				url = new URL(location, url);
				if (url.protocol !== 'https:' || url.port || url.username || url.password
					|| !(url.hostname === 'www.google.com' || /^t[0-9]\.gstatic\.com$/.test(url.hostname))) break;
				continue;
			}
			if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/png'
				|| Number(response.headers.get('content-length')) > 32768 || !response.body) {
				await response.body?.cancel();
				break;
			}
			const bytes = new Uint8Array(32768);
			let length = 0;
			const reader = response.body.getReader();
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					if (length + value.length > bytes.length) throw new Error('Icon too large');
					bytes.set(value, length); length += value.length;
				}
			} finally { await reader.cancel(); reader.releaseLock(); }
			const view = new DataView(bytes.buffer);
			if (length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
				|| view.getUint32(12) !== 0x49484452 || view.getUint32(16) === 0 || view.getUint32(20) === 0
				|| view.getUint32(16) > 128 || view.getUint32(20) > 128) break;
			icon = `data:image/png;base64,${btoa(Array.from(bytes.subarray(0, length), b => String.fromCharCode(b)).join(''))}`;
			break;
		}
	} catch { /* Missing icons or an unavailable provider must not break the badge. */ }
	await cache?.put(key, new Response(icon ?? '', { headers: {
		'cache-control': `public, max-age=${icon ? 86400 : 600}`
	} })).catch(() => undefined);
	return icon;
}
