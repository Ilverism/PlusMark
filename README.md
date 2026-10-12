[![👍 Thumbs Up](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmarktest-g-94c35593506ad1bb&r=thumbs-up)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmarktest-g-94c35593506ad1bb&r=thumbs-up) [![🔥 Fire](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmarktest-g-94c35593506ad1bb&r=fire)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmarktest-g-94c35593506ad1bb&r=fire) [![😍 Love It](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmarktest-g-94c35593506ad1bb&r=love-it)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmarktest-g-94c35593506ad1bb&r=love-it) [![Source: https://github.com/Ilverism/PlusMarkTest](https://plusmark.ilverism.workers.dev/source-badge?doc=github-com-ilverism-plusmarktest-g-94c35593506ad1bb)](<https://github.com/Ilverism/PlusMarkTest>) [![PlusMark](https://plusmark.ilverism.workers.dev/PlusMark-badge.svg)](https://plusmark.ilverism.workers.dev/)

# sv

## Service statistics

The homepage shows **Reactions Generated / Votes Submitted**, tracked from deployment of the statistics feature. A distinct reaction ID within a group counts once, even if removed and re-added. Regeneration, image requests, source badges, and branding badges do not count. Accepted votes and removals count as submissions; rejected requests and retries of the same submission do not. Existing badges and historical votes are not backfilled.

Production counters persist in SQLite Durable Objects. Each group records counters alongside the corresponding mutation, then sends cumulative snapshots through its alarm scheduler, batched for 60 seconds. Duplicate or older snapshots are ignored. Failed deliveries retry after five minutes without blocking voting. The read-only `/api/statistics` response is cached for 60 seconds; the homepage refreshes once a minute while visible, so normal display lag can be a few minutes. Local Vite totals use the development in-memory store and reset with the server.

Deployment requires the `v2_service_statistics` migration and `SERVICE_STATISTICS` binding in `wrangler.jsonc`; the build exports the new Durable Object automatically. No additional secret is required.

## Reaction groups and source checks

The generator creates a random 16-character reaction group ID (64 random bits).
It stays fixed through edits and regeneration within the current page visit.
Return URL, Content ID, reactions, and generated output start fresh on reload; a
new random group ID is created. Only the two Main Card checkboxes, locale, and
theme are retained between sessions. Old saved drafts are discarded automatically
(their source-check preference is migrated). **Randomize reaction group ID** creates a new ID and separate counters;
previously pasted badges and their votes remain intact. You can instead enter a
manual group ID (up to 32 letters, numbers, or single separating dashes), or clear
the field to use a legacy Content ID without a suffix. IDs are case-insensitive.

The generated badge ID is `<normalized-content-id>-g-<group-id>`. The existing
`doc` and `r` URL parameters and storage namespace are unchanged. Combined IDs
over 120 characters are rejected, not truncated. The Badge ID preview shows the
actual key. Reusing that key reuses the group, whether it was entered manually or
generated. Group IDs reduce accidental collisions; they are not secrets or access
tokens. Copying a badge copies its group identity too.

**Reject votes from other URLs** defaults on in new generator drafts. The server checks
the HTTP `Referer` inside the same transaction that adds/removes the vote. A
different origin or page path returns 403 without changing the vote, with a link
to the intended page. Configured query parameters must match (including repeated
values); extra query parameters are allowed. Fragments are ignored, so comments
and sections on the same page cannot be distinguished. Paths remain exact,
including trailing slashes; alternate renderings such as a GitHub README on the
repository landing page need the check disabled if one group must work at both
URLs. The Return URL retains its fragment for navigation back to the section.

Missing, malformed, non-HTTP, and same-origin origin-only referrers are treated
as unknown and allowed. This is a best-effort guard against accidental reuse and
ordinary clicks from other pages, not authentication: clients can omit or forge
the header. Image requests are not restricted because Camo strips source context.

### Compatibility policy

- Existing badge URLs, stored counts, voter identities, and edit tokens continue
  working. Browser edit tokens now use tab-scoped session storage; old locally
  stored tokens are moved there. They survive reloads, but a new tab session does
  not retain edit access to previously generated groups. An additive SQLite column defaults existing widgets to source checks
  **off**. No database reset or badge regeneration is required.
- API creates that omit `verifyReferrer` also default off. Authorized updates that
  omit it preserve the current setting; only an explicit boolean changes it.
  Enabling it for an old widget requires its existing edit token.
- To edit an old widget in the generator, enter its old Content ID, clear the
  group ID, and choose the source-check setting intentionally. Changing the
  group ID creates a different widget; it does not migrate votes.
- Prefer additive fields and opt-in migrations for already published Markdown.
  An incompatible URL/key change should use a versioned contract and a migration
  plan. During this private testing phase, a documented reset can be reasonable
  with explicit owner approval; it should never happen silently during deployment.

Validation: `node --test scripts/test-reaction-location.mjs` checks matching and
identity edge cases; `node scripts/test-reaction-location-runtime.mjs` runs the
production Durable Object against a populated legacy SQLite schema, including
restart persistence. `src/routes/reaction-groups.e2e.ts` covers the form, API,
fresh form state, checkbox preferences, separate counters, and real browser navigation.

## Automated reaction requests

`HEAD /react` and GET requests explicitly marked as `prefetch` or `prerender`
in `Sec-Purpose`, `Purpose`, `X-Purpose`, or `X-Moz` return an empty 204 response.
They do not create a voter cookie, change a vote, or redirect. Reaction responses
use `Cache-Control: no-store` so a skipped request or voting redirect is not
reused for a subsequent click. `robots.txt` disallows `/react`, and reaction
responses include `X-Robots-Tag: noindex, nofollow` to discourage indexing.

All GET requests are now read-only for votes. Existing badge links open a small
verification page. Managed Cloudflare Turnstile runs on the first click, and the
server validates its token, exact hostname, action, and submission ID before
accepting a POST. Successful verification sets a signed, HttpOnly cookie for one
hour. Every reaction requires pressing **Submit Reaction** on the verification
page, including when that cookie skips another challenge. Completing Turnstile
only enables the button; it never submits a vote. The existing visitor cookie still identifies
the vote, so verification expiry does not prevent removing an earlier vote.

POSTs require a same-origin request and a signed, visitor-bound ticket valid for
ten minutes. The original badge-page referrer is carried in that ticket and
checked again at voting time. Submission receipts commit atomically with votes;
retries cannot accidentally undo the same click, including after a server restart.
Expired receipts are removed on subsequent submissions. Badge images remain
public and require no Turnstile check. JavaScript and cookies are required to vote.
Existing URLs, votes, and edit tokens are preserved; direct GET-based voting API
clients must move to the verified flow. Previous automated votes are not removed.
Turnstile reduces automated voting but does not guarantee a unique human or stop
every browser scanner. Explicit submission prevents passive page loads from voting,
but automation that deliberately submits the form may still vote.

The public `TURNSTILE_SITE_KEY` and exact production `TURNSTILE_HOSTNAME` live in
`wrangler.jsonc`. Store `TURNSTILE_SECRET` in the Worker secret binding and ignored
local `.env`. The widget must permit the production hostname and local test hosts.
Production never accepts a token for localhost; missing configuration fails closed.
`pnpm preview` explicitly overrides the expected hostname to `localhost` for local
production-build testing at `http://localhost:4173`.
Keep `PLUSMARK_HMAC_SECRET` stable, since it also preserves existing vote identities.
Do not deploy this route until the Turnstile secret is configured.

Validation: `node --test scripts/test-reaction-verification.mjs`,
`node scripts/test-reaction-route.mjs`, and
`node scripts/test-reaction-location-runtime.mjs` cover verification, expiry,
CSRF, replay protection, legacy data, and persisted production SQLite receipts.
Browser tests cover the verification page, rejected tokens, retry handling, and
read-only link visits. A real-widget browser check is also needed after deployment.
`node scripts/test-reaction-page.mjs` checks explicit confirmation with a mocked
widget, pass reuse, expiry, retries, keyboard activation, and responsive layout.

For styling, open `/react/preview` on the Vite dev server (for example,
`http://localhost:4000/react/preview`). Add `?verified=1` to preview the ready
message and enabled button. Both use the real page markup and `static/reaction-verification.css`;
refresh after edits. This static preview loads no Turnstile, creates no votes,
and stays on screen. It requires no keys or saved reaction group and returns 404
in production builds, including `pnpm preview`.

## Passive vote diagnostics

Workers Logs persist structured `reaction.request` and `reaction.vote` events with
100% head sampling. Automatic invocation logs are disabled so routine badge image
loads do not fill the log store. No database migration or voting rule is changed.

`reaction.request` covers verification-page GETs and vote POSTs, including rejected
requests. It records the processing phase and HTTP status, group/reaction IDs,
submission ID, whether verification used Turnstile or the one-hour pass, browser
signature, Fetch Metadata headers, and Cloudflare network/ASN/country information.
Bot scores are included only when Cloudflare provides them. Source URLs omit
credentials, query strings, and fragments; missing referrers remain unknown.
These signals help investigate scanners, but do not establish a person's identity.
Custom audit fields exclude raw IPs, cookies, request bodies, and verification tokens.

`reaction.vote` is emitted by the Durable Object only after a vote transaction
commits, before cache-purge work. `active: true` means added, `false` means removed;
`count` is the resulting total. Replayed tickets produce no additional committed-vote
event. Match `submissionId` to the request events to identify the verification path
and source metadata. `voter` is the existing per-document HMAC, not the visitor cookie.
An accepted request alone may be a retry; count committed events instead.

In Cloudflare, open **Workers & Pages → plusmark → Logs**, choose the last two hours,
filter `event` to `reaction.vote`, and filter `doc` to the affected full group ID.
Look up its `submissionId` in `reaction.request` events. Repeated additions from
different voter hashes with the same browser/network are worth investigating, but
are not automatically classified as abuse. Collection continues without a local
terminal. The [documented retention](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#pricing)
is three days on Free and seven on Paid as of October 2026, subject to plan limits.
Logs are diagnostic evidence, not a transactional audit database: platform logging
limits or process failures can still leave gaps. Set `observability.enabled` to
`false` and redeploy to stop retained logging after investigation.

## Badge appearance and counts

Reaction badges include a two-color destination dot derived from the normalized,
stored Return URL (including query and fragment). The optional source badge uses
the same dot, shows a shortened destination, and links directly to that URL.
It follows the reactions and precedes the PlusMark branding badge, which has no
dot. The source checkbox defaults on for each new session; it does not persist
additional form state. Dots identify destinations, not groups or verified origins,
and similar colors are possible. The complete destination is included in badge
titles and generated source-image alt text. Count, hourglass, and dot have separate
reserved spaces.

Source favicons are fetched server-side using Google's favicon service, sending
only the hostname. Only bounded PNG responses from the provider's allowed hosts
are embedded, with a link icon fallback for missing icons or failed lookups.
The Worker caches successful icons for a day and failed lookups for ten minutes.
No third-party image is loaded by the viewer inside the SVG, and reaction badge
requests never fetch favicons. The provider is best-effort and needs no API key.
Regenerate existing Markdown to add a source badge, or after changing a Return URL
so the source link updates too. Old reaction links continue working and acquire
their dots when their images refresh; throttled snapshots may lag until expiry.

Reaction badges add a subtle shadow behind the emoji. Counts below 1,000 remain
exact; larger counts are truncated to one decimal place using `k`, `m`, `b`, or
`t` (trailing `.0` is omitted). For example, 2,315 and 2,388 both display `2.3k`,
while 1,323,521 displays `1.3m`. Storage and API responses retain the exact total.
Votes only queue the fallback Camo purge when the displayed count or throttle indicator changes;
pending purges and retries are preserved when subsequent votes stay in that range.

By default, generated Markdown ends with a logo-only PlusMark badge on the
Tailwind `orange-200` background, linking to the hosted PlusMark site. The
"Include PlusMark badge" checkbox below Content ID controls its inclusion and
remembers the choice in local storage for this browser.
Previously pasted Markdown needs regeneration or the logo link appended manually.

## Busy-traffic badge updates

At 300 accepted add/remove actions within a per-reaction 60-second traffic window,
the badge enters throttled mode. Votes still update the exact count immediately,
but the public badge publishes a snapshot at most once every 60 seconds, with a
small gray hourglass indicating delayed counts. A qualifying busy window extends
the cooldown; when it expires, a Durable Object alarm publishes the final count
and removes the indicator, even if nobody requests the badge again. Entering and
leaving throttled mode are additional publications, including when compact counts
such as `2.3k` remain unchanged. Quiet reactions remain live.

Throttled SVG responses are cached internally at the Cloudflare edge until the
next scheduled publication, avoiding Durable Object reads on cache hits. The
outgoing headers remain `no-cache`/`no-store`; Camo retains its existing purge
budgets (15 minutes per target, eight attempts per document per hour). Neither a
60-second snapshot interval nor the hourglass guarantees GitHub refreshes within
60 seconds. Existing cached images may initially omit the indicator.

Thresholds are defined in `src/lib/server/badge-throttle.ts`. Throttle state is
stored in the additive `badge_publications` SQLite table; existing votes and
counts are preserved. Development mode uses the same policy but refreshes lazily
on badge reads. This protects refresh workload, not vote integrity: it does not
reject automated votes or eliminate incoming Worker request charges.

## GitHub reaction image freshness

The `/badge` endpoint must send `Cache-Control: max-age=0, no-cache, no-store,
must-revalidate`. In live tests, GitHub's Camo proxy cached responses without
`max-age=0` despite the other directives. Keep the explicit zero TTL.

After deploying this change, an image cached with the old headers may need a
**one-time** `PURGE` request to its exact `camo.githubusercontent.com` URL. Changing
the origin headers does not invalidate an existing proxy response. A new query
parameter in the Markdown's image URL also creates a new cache key, but does not
need to change on each reaction once the corrected headers are in effect.

Counts update when an image is requested (page load/reload or return after a
reaction). An already-open GitHub page does not poll for changes. The automatic
purge fallback is rate-limited; transient failures retry without dropping votes
arriving during an in-flight purge. It cannot discover images on private GitHub
pages without access.

### Repeatable validation

Requires Node.js 24+ and the project's Playwright Chromium installation.

```sh
node --test scripts/test-badges.mjs scripts/test-camo-purge.mjs
node scripts/test-badge-throttle.mjs # Local workerd/SQLite/cache check; includes a 65-second cooldown
pnpm exec playwright test
node scripts/probe-github-cache.mjs https://plusmark.ilverism.workers.dev
node scripts/probe-browser-cache.mjs https://plusmark.ilverism.workers.dev
```

The live probes create isolated widgets and remove their test votes afterward
(the empty test widgets remain). GitHub's Markdown API supplies real Camo URLs;
the probes reuse those URLs without cache-busting or repeated purges. A non-GitHub
return URL prevents automatic purges from masking the result. The browser probe
serves GitHub-rendered HTML on localhost and exercises two separate visitors,
12 reaction clicks and 12 observer reloads with normal browser caching enabled.
It tests the real image proxy, not GitHub's surrounding page/navigation code.
JSON measurements and a browser screenshot are saved in `.cache-probes/`.

Acceptance target: every tested change visible on the first load within five
seconds. On October 8, 2026, the pre-fix image remained stale for over 60 seconds;
after propagation, the header fix passed all 26 browser image loads in 0.22–0.79
seconds. A pre-existing stale image passed three changes in 0.42–0.43 seconds after
one purge. These measurements cover one network region, not a global latency SLA.

The existing Thumbs Up/Thumbs Down URLs supplied from the issue were also tested
through Camo with a browser: four count changes appeared on the first reload in
0.22–2.30 seconds, and both test votes were removed. They already had the new
headers and needed no purge. One initial browser run timed out waiting for an
image response; a diagnostic run and the repeat completed successfully. The
private GitHub issue itself was inaccessible to the test browser, so navigation
within GitHub's authenticated UI still needs a manual check.

## Emoji picker performance

The picker lazily loads and reuses its immutable catalog. An IntersectionObserver
reveals emoji artwork within the scroll area plus one nearby row; all buttons stay
in the DOM for native keyboard navigation. Offscreen artwork uses
`content-visibility: hidden` until revealed. Per-emoji forced graphics layers and
blurred text shadows are removed, and panel transitions take 120 ms in / 80 ms out.

Run `pnpm exec playwright test` for category, scrolling, keyboard selection,
search, and rapid reopen coverage. To reproduce the performance measurements,
build with `pnpm build`, run `pnpm preview`, then in another terminal run:

```sh
node scripts/profile-emoji-picker.mjs http://127.0.0.1:4173 local
```

The probe uses Chromium with 4x CPU throttling, three interaction cycles, and
writes JSON and a screenshot to `.cache-probes/`. `nextPaintMs` estimates click
response using animation frames; `readyPaintMs` waits for emoji content to be
revealed (or the closing panel to be removed), then allows painting. These are
lab estimates, not field INP measurements.

Hosted measurements on October 8, 2026: large category content appeared in
272–308 ms on the first visit and about 102–118 ms on repeat visits, versus
740–942 ms before the change. Closing took about 136 ms instead of 365–388 ms.
The initial catalog/font load still took about 281 ms. Results depend on browser,
hardware, fonts, and network; Firefox and Safari were not profiled.

---

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
pnpm dlx sv@0.15.3 create --template minimal --types ts --add eslint playwright tailwindcss="plugins:none" sveltekit-adapter="adapter:cloudflare+cfTarget:workers" drizzle="database:sqlite+sqlite:libsql" mdsvex paraglide="languageTags:en, es+demo:no" mcp="ide:vscode+setup:remote" --install pnpm PlusMark
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
