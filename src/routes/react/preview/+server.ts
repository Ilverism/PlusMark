import { dev } from '$app/environment';
import { error, type RequestHandler } from '@sveltejs/kit';
import { reactionPage } from '$lib/server/reaction-page';

export const GET: RequestHandler = ({ url }) => {
	if (!dev) error(404, 'Not found');
	return new Response(reactionPage({
		doc: 'example-content-g-0123456789abcdef', action: '/react/preview', ticket: '', ticketId: '', siteKey: '',
		verified: url.searchParams.get('verified') === '1',
		returnUrl: '/', label: '👍 Thumbs Up', preview: true
	}), {
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'no-store',
			'x-robots-tag': 'noindex, nofollow',
			'content-security-policy': "default-src 'none'; style-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"
		}
	});
};
