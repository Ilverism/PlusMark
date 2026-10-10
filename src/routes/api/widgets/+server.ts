import { json, type RequestHandler } from '@sveltejs/kit';
import {
	createEditToken,
	getReactionDocumentStub,
	hashEditToken,
	parseWidgetPayload
} from '$lib/server/reaction-service';

export const POST: RequestHandler = async (event) => {
	let payload: unknown;

	try {
		payload = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body.' }, { status: 400 });
	}

	const parsed = parseWidgetPayload(payload);
	if (parsed instanceof Response) return parsed;

	const createToken = await createEditToken();
	const createEditTokenHash = await hashEditToken(createToken);
	const editTokenHash = parsed.editToken ? await hashEditToken(parsed.editToken) : null;

	const stub = await getReactionDocumentStub(event, parsed.doc);
	const result = await stub.saveWidget({
		widget: {
			doc: parsed.doc,
			returnUrl: parsed.returnUrl,
			verifyReferrer: parsed.verifyReferrer,
			reactions: parsed.reactions
		},
		editTokenHash,
		createEditTokenHash
	});

	if (!result.ok) {
		return json({ error: result.message }, { status: result.status });
	}

	return json({
		widget: result.widget,
		editToken: result.created ? createToken : undefined
	});
};
