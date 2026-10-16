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

Configure ingress mode `public_route` (UI PUBLIC_ROUTE), proposed hostname
`lacuisinederosalie.ca`, path `/api/*`. This is a proposal only: the existing
domain must support proxied HTTPS Worker routing before cutover. Admin's
`worker-exposure.mjs` requires a narrow path ending `/*`, disables workers.dev and
preview ingress, and removes extra ingress for the managed replacement. Never
register the legacy Worker as the replacement: use a separate managed Worker.
No Admin UI changes are included here.

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
do not inject it into a test-key deployment. `settings.json` already selects
`/api/create-checkout-session`. `main.js` POSTs JSON without CrowdNet headers and
uses `checkout_url`; no fallback endpoint is configured. Keep that relative URL
for the proposed same-origin route. For a separate API hostname, set an absolute
HTTPS URL only in an isolated staging storefront, allow that storefront's exact
origin, and keep PUBLIC_SITE_ORIGIN pointed at the data host, not the API host.

The storefront still contains pre-existing browser administration routines for
GitHub/Stripe credentials (report #213). This API exposes no administrative
operations and never sends its Stripe key to the frontend. Removing that separate
legacy browser tooling remains an outstanding storefront security concern; this
conversion does not certify the entire frontend secure.

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
Using existing Admin controls, switch only the approved hostname's `/api/*` route
after storefront HTTPS/proxy prerequisites pass. Leave static Pages/DNS unchanged
unless separately authorized. Run an approved checkout smoke check and monitor
error rates, duplicates, price mismatches and Stripe sessions.

If errors increase or checkout fails, restore the captured route target and
frontend endpoint/config, retaining the legacy Worker and its secrets. Restore
any separately approved proxy/DNS changes from the snapshot. Never retry an
ambiguous Stripe creation automatically: check Stripe for existing sessions first.
Do not delete/revoke either deployment, secrets, or pending sessions during
rollback. Recheck browser checkout and health; record the failed replacement SHA
and redacted evidence for a later staging fix. Live route changes, payments,
DNS, GitHub Pages changes and secret rotation require separate authorization.
