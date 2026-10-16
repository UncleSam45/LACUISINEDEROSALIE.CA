# Temporary closure — ticket #280

Closure is enabled in `assets/data/settings.json` with `closure.enabled: true`.
The announcement says **jusqu’au 23 octobre 2026**. This is the supplied client
copy, pending final approval; it does not promise a reopening hour.
`reopening_confirmed` is false and `reopens_at` is null. No timer or automatic
reopening is installed. AQUAHYDRA must obtain the exact day, local hour and
business timezone from Rosalie before reopening (October 23 versus after it).

## Publish and verify

1. Run `python3 scripts/test_build_site.py` and `npm test --prefix worker`.
2. Deploy the **generated artifact**, using `python3 scripts/build_site.py _site`.
   The Pages workflow does this automatically on a main-branch push. The original storefront is preserved in `storefront.html`. Source-root publishing
   is also protected by committed closure `index.html` and `404.html` shells.
   `scripts/set_closure.py` keeps those shells and the closure flag together.
3. The generated `index.html` and `404.html` are the same French announcement,
   with no storefront JavaScript and no ordering controls, even without JS.
   GitHub Pages serves unknown/deep links through `404.html` (HTTP 404 is expected).
   For another host configure unknown routes to this closure document too.
4. Essential admin access is `/admin.html`, using the existing `?` portal button
   and existing credentials. Local editor tools and payment webhooks are unchanged.
5. **Separately deploy the updated `worker.js` to every active checkout Worker**;
   Pages static deployment does not deploy it. Alternatively set runtime variable
   `STOREFRONT_CLOSED=true` on updated checkout Workers. Pages Functions use the
   updated Worker through their existing adapter. Retired Node route remains 410.
   Check any configured `PUBLIC_SITE_DATA` binding: it must contain current
   `settings.closure.enabled=true`, or use the emergency runtime flag. Unbound
   Workers fetch published settings with `cache: no-store` and fail closed if
   configuration is unavailable. All four checkout URL aliases return 503 before
   parsing an order or contacting Stripe. Existing orders are never edited.
6. Verify canonical domain, www alias and any public hosting/Worker URLs: `/`,
   `/index.html`, `/menu`, `/commander`, `/nested/path`, query strings, mobile,
   existing browser profiles and a clean browser, with and without JavaScript.
   Confirm every public checkout alias returns 503, no checkout URL, and no new
   Stripe Session. Check health and admin order reads still work. Do not submit
   valid live orders as a test.
7. Check actual HTTP headers and CDN cache rules. `_headers` is included for hosts
   that support it; **GitHub Pages ignores it**. Purge an external CDN's cached
   HTML/404/settings/JS and configure bypass/no-store there. Old loaded tabs cannot
   be remotely removed; server checkout rejection is the enforcement boundary.
8. Before declaring all payment paths closed, inspect Stripe for any still-open
   hosted Checkout Sessions or Payment Links created before closure. The new code
   blocks new session creation but cannot revoke an existing hosted payment URL.
   Expire only unpaid open sessions / deactivate relevant Payment Links through
   the authorized Stripe operator. Preserve paid sessions, records and webhooks.

## Manual restoration — after client confirmation only

1. Record Rosalie's approved reopening date, hour, timezone and approval with the
   release. Keep this manual until confirmed.
2. Run `python3 scripts/set_closure.py open` and commit its changes. This sets
   `closure.enabled` to false and restores source shells for branch-based Pages. Keep original `ordering.enabled` and all
   catalogue/business data unchanged. If used, clear `STOREFRONT_CLOSED` and refresh
   bound `PUBLIC_SITE_DATA` on every checkout deployment.
3. Run the tests above. Build into a fresh `_site` directory and deploy the static
   artifact and checkout code/config together. The builder restores the original
   `index.html` byte-for-byte and removes closure-only admin/404 files on rebuild.
4. Purge/revalidate CDN HTML, settings and JS. Check the regular menu, cart,
   delivery rules and admin. Verify checkout in Stripe test mode. Business-hours,
   menu, delivery and pricing validation still apply after reopening.
5. If anything fails, run `python3 scripts/set_closure.py closed` and set the runtime emergency flag,
   rebuild and redeploy. Do not delete orders or alter Stripe catalogue records.

## Validation scope

Automated checks cover all checkout aliases with imported/string/remote settings,
uncached reads, early rejection without Stripe calls, health, preservation of the
admin shell and data, and restoration of the original storefront. Payment webhook
regressions also run. Production routing, CDN headers, deployed Worker bindings,
open Stripe Sessions and final client confirmation require operational verification;
local passing tests alone do not establish those acceptance criteria.
