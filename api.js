/**
 * CROWDNET APPLICATION API ARCHITECTURE
 * =====================================
 *
 * FRONTEND DOES NOT CALL api.js.
 * FRONTEND CALLS https://security.vaisica.org.
 * SECURITY THEN CALLS api.js PRIVATELY.
 *
 * FRONTEND
 *   | POST https://security.vaisica.org/<application-route>
 *   | X-CrowdNet-Username, X-CrowdNet-Access-Key, X-CrowdNet-App
 *   v
 * CROWDNET SECURITY GATEWAY (https://security.vaisica.org)
 *   | authenticates the user and validates Vault access
 *   | validates the application and permissions
 *   | resolves the service in D1 and routes the unchanged request path
 *   v
 * PRIVATE SERVICE BINDING
 *   v
 * THIS api.js WORKER
 *   v
 * APPLICATION BACKEND SERVICES
 *
 * ==========================================
 * NEVER CONNECT THE BROWSER DIRECTLY TO THIS WORKER
 * ==========================================
 *
 * THIS WORKER IS PRIVATE. It does not have a public URL.
 *
 * DO NOT:
 * - create a workers.dev endpoint or preview URL for application use
 * - create a custom domain for this Worker
 * - send the frontend directly to this Worker
 * - add a Worker URL to main.js
 * - add WORKER_API configuration to the application
 * - create /api routing on the website to reach this Worker
 * - expose the service-binding name to the browser
 *
 * WRONG: browser -> api.js
 * WRONG: browser -> tickets.example.com/api -> api.js
 * WRONG: browser -> workers.dev -> api.js
 * CORRECT: browser -> security.vaisica.org -> CrowdNet Security
 *          -> private service binding -> api.js
 *
 * The browser communicates ONLY with https://security.vaisica.org.
 * CrowdNet Security invokes this Worker through its private service binding.
 * Register exceptional public webhook capabilities with CrowdNet instead of
 * adding public ingress to this Worker.
 *
 * FRONTEND -> SECURITY CONTRACT
 * -----------------------------
 * The gateway preserves the requested path when privately forwarding it, so a
 * request to https://security.vaisica.org/api/example reaches /api/example here.
 * Replace <APPLICATION SLUG> with the application ID registered by Security.
 * The username and access key come from the application's authenticated user.
 *
 * const CROWDNET_GATEWAY = 'https://security.vaisica.org';
 * const CROWDNET_APP = '<APPLICATION SLUG>';
 *
 * async function crowdnetRequest(path, payload = {}) {
 *   return fetch(`${CROWDNET_GATEWAY}${path}`, {
 *     method: 'POST',
 *     headers: {
 *       'Content-Type': 'application/json',
 *       'X-CrowdNet-Username': username,
 *       'X-CrowdNet-Access-Key': accessKey,
 *       'X-CrowdNet-App': CROWDNET_APP
 *     },
 *     body: JSON.stringify(payload)
 *   });
 * }
 *
 * SECURITY -> api.js CONTRACT
 * ---------------------------
 * The currently deployed gateway injects these authoritative trusted headers:
 * - X-CrowdNet-User: normalized, authenticated CrowdNet username
 * - X-CrowdNet-Access-Level: permission/access level resolved from D1
 *
 * Never expect the browser to supply these trusted downstream headers.
 * CrowdNet Security generates them. They are trustworthy only because api.js
 * is private behind a service binding. Do not treat other client headers as
 * authenticated identity or authorization data.
 *
 * RESPONSIBILITY BOUNDARY
 * -----------------------
 * CrowdNet Security owns username lookup, access-key validation, Vault
 * authorization, application validation, permission lookup, service resolution,
 * and private Worker routing. api.js should normally NOT recreate CrowdNet's
 * authentication system.
 *
 * api.js owns application business logic, operation-specific validation,
 * protected backend operations, GitHub persistence where applicable, provider
 * integrations, and Worker-side secrets. Secrets belong on env and must never
 * be committed or sent to the browser.
 *
 * GITHUB CREDENTIAL SEPARATION
 * ----------------------------
 * USER CREDENTIAL — X-CrowdNet-Access-Key
 * This is consumed by Security to prove access to the registered Vault, then
 * removed. It is never forwarded to api.js and must never be used for provider
 * provisioning, application persistence, or website publishing.
 *
 * SERVICE CREDENTIAL — env.GITHUB_TOKEN
 * This belongs to this private application Worker. Use it for application-owned
 * persistence, website publishing, provisioning, and server-side GitHub
 * operations. Never expose it to the browser.
 *
 * STANDARD APPLICATION STATE — env.APP_STATE
 * ------------------------------------------
 * Every root api.js Worker receives its own SQLite-backed Durable Object.
 * Obtain the named, application-scoped instance with:
 *
 * const state = env.APP_STATE.getByName('main');
 * // Compatibility equivalent:
 * // env.APP_STATE.get(env.APP_STATE.idFromName('main'));
 *
 * Use it for coordinated/shared application state, sessions, queues,
 * revisions, counters, synchronization, and transactional state. Calls to the
 * object are private Worker binding calls; developers need no Cloudflare token.
 *
 * STANDARD APPLICATION STORAGE — env.APP_STORAGE
 * ------------------------------------------------
 * Every root api.js Worker also receives its own private R2 bucket:
 *
 * await env.APP_STORAGE.put(key, value);
 * const object = await env.APP_STORAGE.get(key);
 *
 * Use it for images, attachments, generated files, audio/video assets,
 * backups, and other application-owned binary/object data. Do not distribute
 * R2 credentials: application code accesses storage only through this binding.
 *
 * Keep the ES Module default export and use standards-based Worker APIs. Avoid
 * local imports unless their modules are included in the deployment bundle.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({
        ok: true,
        service: env.CROWDNET_APP
      });
    }

    const username = request.headers.get('X-CrowdNet-User');

    if (!username) {
      return Response.json(
        {ok: false, error: 'UNAUTHORIZED'},
        {status: 401}
      );
    }

    if (url.pathname === '/api/example' && request.method === 'POST') {
      // CrowdNet Security has already authenticated and routed this request.
      // Use env.GITHUB_TOKEN or other Worker-side secrets for protected work.
      return Response.json({ok: true, user: username});
    }

    return Response.json(
      {ok: false, error: 'NOT FOUND'},
      {status: 404}
    );
  }
};

// CrowdNet owns this exported class and its initial SQLite migration. Add
// application-specific state methods here; do not rename the class or binding.
export class CrowdNetAppState {
  constructor(ctx) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  }

  async fetch(request) {
    const key = new URL(request.url).pathname.slice(1);
    if (!key) return Response.json({ok: false, error: 'STATE KEY REQUIRED'}, {status: 400});
    if (request.method === 'GET') {
      const row = this.sql.exec('SELECT value, updated_at FROM app_state WHERE key = ?', key).toArray()[0];
      return row ? Response.json({ok: true, value: JSON.parse(row.value), updatedAt: row.updated_at}) : Response.json({ok: false, error: 'NOT FOUND'}, {status: 404});
    }
    if (request.method === 'PUT') {
      const value = await request.json();
      this.sql.exec('INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP', key, JSON.stringify(value));
      return Response.json({ok: true});
    }
    if (request.method === 'DELETE') {
      this.sql.exec('DELETE FROM app_state WHERE key = ?', key);
      return Response.json({ok: true});
    }
    return Response.json({ok: false, error: 'METHOD NOT ALLOWED'}, {status: 405});
  }
}
