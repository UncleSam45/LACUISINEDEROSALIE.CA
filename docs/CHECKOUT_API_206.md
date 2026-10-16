# Ticket #206 — public checkout API

Implementation is ready for isolated validation. Production cutover and Stripe
test-mode end-to-end acceptance are **not approved or completed**.

## Source and Admin contract

Select repository `UncleSam45/LACUISINEDEROSALIE.CA`, root source `api.js` and an
explicit reviewed commit SHA in the existing Admin Worker interface. The source
is self-contained JavaScript with `export default { fetch(request, env) }`, no
local imports or CommonJS. Admin `control-plane.mjs` at
`b20de97fbe152e597629e7d0dc8bc05930d04502` defines `inspectWorkerSource` and
`standardApplicationSource`; The source preserves the platform-owned `CrowdNetAppState` class, and Admin
provisions `APP_STATE` and `APP_STORAGE`. Checkout does not use these bindings or
expose them. Do not copy the private starter's user-authentication requirements
into this explicitly public checkout application.

Configure ingress mode `public_route` (UI PUBLIC API), hostname
`api.lacuisinederosalie.ca`, route `/api/*`. The storefront remains at
`lacuisinederosalie.ca` on DNS-only GitHub Pages. This separate API hostname is
intentional: Admin rejects a Worker route on the exact Pages-owned apex with
`HOSTNAME_ASSIGNED_TO_PAGES`. Repeating the deployment against the apex cannot
succeed under Admin's current ownership rules. Admin's `worker-exposure.mjs`
requires a narrow path ending `/*`, disables workers.dev/preview ingress and
removes extra ingress. No changes to Admin source are necessary for this topology.

**Before deployment:** create and validate a **proxied** Cloudflare DNS record
for `api.lacuisinederosalie.ca` (for a route-only Worker, a proxied AAAA
placeholder with address `100::` is a supported approach). A Cloudflare Worker
Route alone does not make a DNS-only hostname reachable. Do not alter the apex
GitHub Pages DNS records or attach the API Worker to the apex. The new managed
Worker replaces the legacy checkout behavior, not the GitHub Pages site.

At PR preparation, remote main `094b0bf826da68df7b4e8b73f84bb94dbf4f454f`
already contains Admin’s private starter api.js. This change replaces that
starter’s example/authentication handler with the public checkout implementation
and preserves its platform-owned state class. Other current-main files, including
`crowdnet-deployment.json`, are preserved.

## Environment contract

| Name | Required / behavior |
| --- | --- |
| `STRIPE_SECRET_KEY` | Server secret. `sk_test_…` in staging; separately approved live key at cutover. Never commit or put in public JSON/browser storage. |
| `PUBLIC_SITE_ORIGIN` | Explicit HTTPS storefront origin, no path, credentials, query or fragment. Defaults to `https://lacuisinederosalie.ca`; never derived from the API host or caller's Origin. |
| `ALLOWED_ORIGIN` | Comma-separated exact browser origins. Defaults to the storefront origin; wildcard grants no access. Include only verified storefront/staging origins. |
| `PUBLIC_SITE_DATA` | Optional JSON string/object with `settings`, `menus`, `items`, `delivery`; otherwise read the four HTTPS `/assets/data/*.json` documents from the storefront origin (60-second Cloudflare cache). |
| `STRIPE_CATALOG_JSON` | Optional complete trusted Stripe catalog JSON; existing object binding `STRIPE_CATALOG` takes precedence. Must match key mode when `environment` is present. |
| `ALLOW_DYNAMIC_PRICE_DATA` | Optional string `true`; enables server-derived inline pricing. A trusted catalog's `allow_dynamic_price_data: true` also retains legacy behavior. Do not enable merely to hide stale mappings. |
| `CHECKOUT_SUCCESS_URL`, `CHECKOUT_CANCEL_URL` | Optional operator-controlled HTTPS storefront URLs; defaults preserve the legacy query parameters and Stripe session placeholder. Verify overrides before deployment. |

Without an injected Stripe catalog, active Stripe prices are discovered using
expanded products and `item_id` / `portion_key` metadata. More than 100 prices
fails closed with an instruction to inject a complete catalog; it cannot silently
use an incomplete page. Recurring/inactive discovered prices are excluded.
No GitHub token, user access key, D1, KV, webhook, or administrative API is needed.

## HTTP and business contract

- Public `POST /api/create-checkout-session`; preserve legacy aliases
  `/create-checkout-session`, `/api/create-checkout-session-v2`, and
  `/create-checkout-session-v2`. Non-`/api/` aliases are accessible by service
  binding only under the proposed route.
- `GET /api/health` and legacy `/health` return liveness and version
  `admin-checkout-v1`; health does not prove Stripe/catalog readiness.
- OPTIONS only on recognized paths. Unknown paths including administration and
  webhooks return 404. Disallowed browser Origin returns 403 before Stripe calls.
  Requests without Origin remain public; CORS is not authentication.
- JSON-only body capped at 32 KiB, including streamed bodies. Errors use the
  existing `{error, worker_version}` contract with 400/403/404/409/413/415/5xx.
  Successful checkout preserves `checkout_url`, `order_id`,
  `checkout_session_id`, the version header and no-store responses.
- Preserve menu membership, availability, portions, integer quantities 1–99,
  50-line limit, minimum subtotal, Montreal ordering window, preparation notice,
  weekday delivery, fulfillment choice, policy acceptance, cities/contact fields,
  pickup address clearing, cooler flag and legacy delivery-window mapping.
- Preserve French Stripe Checkout, payment mode, phone collection, customer email,
  line prices, and identical session/payment-intent metadata including legacy
  `project: rvsite`. Client prices never set charged amounts.
- Promotions are retired: `promotions.json` has `active: []`, and the frontend
  removes old gift lines. Explicit promotional lines are rejected; do not restore
  the obsolete gift offer during this migration.
- Calendar overflow dates now fail validation. The injected validation clock
  controls notice calculations as well as the weekly ordering window.

The source reuses legacy business logic in a standalone file because Admin uploads
one source module. `worker.js` and the Pages adapter remain unchanged rollback
surfaces. API tests and legacy tests cover both; future business changes must
update both until the legacy deployment is retired after separate approval.

## Audit observations (2026-10-15, America/New_York)

Read-only Cloudflare inspection found Worker `rosalie-checkout`, modified
2026-10-16T00:10:54Z. Its downloaded module matches checked-in `worker.js` at
repository base `54b49c5`. Settings contain secret bindings `STRIPE_SECRET_KEY`
and `GITHUB_TOKEN`, no public origin/catalog/CORS variables, empty compatibility
date/flags. The application zone has no Worker routes, the Worker has no custom
domains, workers.dev is enabled and previews disabled. Secret values were neither
read nor changed. This source/config comparison does **not** establish the actual
published browser's routing or full functional parity.

The Pages adapter imports `worker.js` and injects all four JSON documents plus
the committed Stripe catalog. The catalog declares live mode and dynamic pricing;
do not inject it into a test-key deployment. The storefront configuration in
this PR now selects
`https://api.lacuisinederosalie.ca/api/create-checkout-session`. `main.js`
POSTs JSON without CrowdNet headers and uses `checkout_url`; no fallback
endpoint is configured. **Do not merge this endpoint switch into production
until the separate hostname, trusted HTTPS, route, configured secret and test
checkout are verified.** The Worker allows the exact storefront Origin by
default, or via `ALLOWED_ORIGIN`; `PUBLIC_SITE_ORIGIN` must remain the
**storefront data host**, not the API hostname. A staging storefront must use
a separate reviewed origin and test catalog/key.

The storefront still contains pre-existing browser administration routines for
GitHub/Stripe credentials (report #213). This API exposes no administrative
operations and never sends its Stripe key to the frontend. Removing that separate
legacy browser tooling remains an outstanding storefront security concern; this
conversion does not certify the entire frontend secure.

## Actual Admin failure and recovery sequence

The attempted deploy of `crowdnet-lacuisinederosalie-ca` uploaded the Worker
source, then failed at `worker_ingress` with
`HOSTNAME_ASSIGNED_TO_PAGES: lacuisinederosalie.ca`. This is an ownership
guard, **not** a leftover `rosalie-checkout` route. The managed Worker has
no bound secrets yet because Admin enforces ingress before applying secrets.

For the dedicated API host:

1. **Cloudflare DNS (operator, separate authorization):** configure a proxied
   record for `api.lacuisinederosalie.ca` only, not the Pages-owned apex.
2. **Admin Worker deployment:** select this repository's `api.js`, PUBLIC API,
   Public Hostname `api.lacuisinederosalie.ca`, Narrow Public Route `/api/*`.
3. **Secrets via Admin:** add `STRIPE_SECRET_KEY` as a **secret**, initially a
   Stripe test key. Never add it to repository JSON or plaintext variables.
   As explicit non-secret variables, use
   `PUBLIC_SITE_ORIGIN=https://lacuisinederosalie.ca` and
   `ALLOWED_ORIGIN=https://lacuisinederosalie.ca`.
4. **Test catalog:** ensure test prices match the public menu. The checked-in
   `stripe_catalog.json` declares `environment: live`, so it must **not** be
   used as a test-mode `STRIPE_CATALOG_JSON` binding. Prefer a verified matching
   Stripe test catalog or test-mode prices with correct metadata.
5. **Readiness:** verify `GET https://api.lacuisinederosalie.ca/api/health`,
   browser CORS OPTIONS/POST, and one end-to-end Stripe test payment. Health
   proves liveness only, not correct secret, pricing or payment readiness.
6. **Cutover:** only after staging passes and live credentials/catalog, DNS,
   HTTPS and rollback are approved, merge the storefront endpoint change and
   perform a supervised live checkout check. Never merge this branch merely to
   make the static site redeploy before the API is usable.

**Admin deployment nuance:** after a failed `worker_ingress`, the uploaded
Worker can exist with no bound secrets. Fix the public hostname and rerun the
full Admin deployment so it reaches `secret_updates` and
`secret_verification`; source upload alone does not finish the deployment.

## Validation and remaining gates

Run `cd worker && npm test`. Suites exercise legacy and replacement checkout with
mocked Stripe, metadata, fulfillment, published-data fallback, real committed
catalog data, pricing, delivery failures, public health, CORS, unknown/admin
routes, JSON and streamed size limits. These are isolated regressions, not Stripe
test-mode end-to-end evidence. Legacy tests now freeze the clock so they work
outside ordering hours.

Validation results: all six Node suites pass. Wrangler 4.151.0 dry-run builds
`api.js` successfully (23.81 KiB). The retrieved Admin source inspector returns
`ready: true` with all five source checks passing; its generic forwarding warnings
were reviewed: credential-bearing requests target fixed Stripe endpoints, and
public JSON uses the server-controlled storefront origin. Admin's state-class
augmentation was verified. A local Chromium launch failed with a sandbox
`setsockopt: Operation not permitted` / SIGTRAP error, so no real-browser pass is
claimed. Frontend request handling is checked in isolation by executing the
actual `main.js` checkout request functions with a mock HTTP response.

No Stripe test secret or staging destination is configured in the managed
environment. No remote deployment or payment was attempted. Before acceptance:

1. Capture current routes/DNS/proxy state, Worker source/version/config, frontend
   settings and catalog hashes in restricted operator storage. Keep secret values
   in the existing secret manager; record only names in engineering evidence.
2. Prepare a separate staging storefront and managed replacement, test-mode key,
   test prices and matching current-menu data. Confirm every portion's CAD amount,
   catalog mode and dynamic-pricing policy. Use existing Admin interfaces.
3. Verify HTTPS, public JSON fetches, exact CORS preflight and POST in a real
   browser without login. Test menu-open and closed periods, minimum orders,
   notice, delivery/pickup, retired gifts, price mismatch and upstream failures.
4. Create a real test-mode Checkout session and complete hosted checkout with
   Stripe test payment details. Verify success/cancel navigation, amounts,
   customer fields and metadata on both session and PaymentIntent. Store only
   redacted evidence, not customer data or keys. Confirm failures create no charge.
5. Obtain explicit production deployment authorization only after those gates
   pass. Do not mark issue #206's staging acceptance complete based on mocks.

## Cutover / rollback (requires separate authorization)

Deploy the reviewed api.js SHA to the separate managed replacement, configure
approved live secrets and origin/catalog variables, and verify health first.
Using existing Admin controls, establish only the dedicated
`api.lacuisinederosalie.ca/api/*` route after that API hostname's proxied
DNS and HTTPS prerequisites pass. Leave the static Pages apex and its DNS unchanged. Run an approved checkout smoke check and monitor
error rates, duplicates, price mismatches and Stripe sessions.

If errors increase or checkout fails, restore the captured route target and
frontend endpoint/config, retaining the legacy Worker and its secrets. Restore
any separately approved proxy/DNS changes from the snapshot. Never retry an
ambiguous Stripe creation automatically: check Stripe for existing sessions first.
Do not delete/revoke either deployment, secrets, or pending sessions during
rollback. Recheck browser checkout and health; record the failed replacement SHA
and redacted evidence for a later staging fix. Live route changes, payments,
DNS, GitHub Pages changes and secret rotation require separate authorization.
