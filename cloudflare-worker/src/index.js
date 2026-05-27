const CONFIG_KV_KEY = "redirect-config";
const DEFAULT_ALLOWED_COUNTRIES = "CN";
const DEFAULT_ALLOWED_TARGET = "https://a.example.com/internal-page";
const DEFAULT_FALLBACK_TARGET = "https://c.example.com/access-info";
const DEFAULT_ADMIN_USERNAME = "admin";

const COUNTRY_OPTIONS = [
    ["CN", "China"],
    ["HK", "Hong Kong"],
    ["MO", "Macao"],
    ["TW", "Taiwan"],
    ["SG", "Singapore"],
    ["JP", "Japan"],
    ["KR", "South Korea"],
    ["TH", "Thailand"],
    ["VN", "Vietnam"],
    ["MY", "Malaysia"],
    ["PH", "Philippines"],
    ["ID", "Indonesia"],
    ["IN", "India"],
    ["AE", "United Arab Emirates"],
    ["SA", "Saudi Arabia"],
    ["US", "United States"],
    ["CA", "Canada"],
    ["MX", "Mexico"],
    ["BR", "Brazil"],
    ["AR", "Argentina"],
    ["GB", "United Kingdom"],
    ["IE", "Ireland"],
    ["DE", "Germany"],
    ["FR", "France"],
    ["NL", "Netherlands"],
    ["ES", "Spain"],
    ["IT", "Italy"],
    ["PT", "Portugal"],
    ["SE", "Sweden"],
    ["NO", "Norway"],
    ["FI", "Finland"],
    ["DK", "Denmark"],
    ["PL", "Poland"],
    ["TR", "Turkey"],
    ["RU", "Russia"],
    ["UA", "Ukraine"],
    ["AU", "Australia"],
    ["NZ", "New Zealand"],
    ["ZA", "South Africa"],
    ["EG", "Egypt"],
];

const COUNTRY_OPTION_CODES = new Set(COUNTRY_OPTIONS.map(([code]) => code));

export default {
    async fetch(request, env = {}) {
        const url = new URL(request.url);
        const config = await readConfig(env);

        if (url.pathname === "/admin" || url.pathname === "/admin-login" || url.pathname === "/admin-logout") {
            return handleAdmin(request, env, config, url);
        }

        if (url.pathname === "/__debug" && config.debugView) {
            if (request.method !== "GET" && request.method !== "HEAD") {
                return methodNotAllowed("GET, HEAD");
            }

            const visitorCountry = getVisitorCountry(request);
            const simulatedCountry = normalizeCountry(url.searchParams.get("country") || visitorCountry);
            const decision = decideRedirect(simulatedCountry, config);
            return debugResponse({
                visitorCountry,
                simulatedCountry,
                decision,
                config,
                requestUrl: url,
            });
        }

        if (request.method !== "GET" && request.method !== "HEAD") {
            return methodNotAllowed("GET, HEAD");
        }

        const visitorCountry = getVisitorCountry(request);
        const decision = decideRedirect(visitorCountry, config);
        console.log(JSON.stringify({
            country: visitorCountry || null,
            allowed: decision.allowed,
            target: decision.target,
            url: request.url,
        }));

        return redirectResponse(decision.target, 302);
    },
};

export async function readConfig(env = {}) {
    const defaults = readEnvConfig(env);
    const stored = await readStoredConfig(env);

    if (!stored) {
        return defaults;
    }

    return {
        ...defaults,
        allowedCountries: normalizeCountries(stored.allowedCountries, defaults.allowedCountries),
        targetAllowed: normalizeTargetUrl(stored.targetAllowed) || defaults.targetAllowed,
        targetFallback: normalizeTargetUrl(stored.targetFallback) || defaults.targetFallback,
        updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : null,
        source: "kv",
    };
}

export function readEnvConfig(env = {}) {
    return {
        allowedCountries: normalizeCountries(env.ALLOWED_COUNTRIES || DEFAULT_ALLOWED_COUNTRIES),
        targetAllowed: normalizeTargetUrl(env.TARGET_ALLOWED) || DEFAULT_ALLOWED_TARGET,
        targetFallback: normalizeTargetUrl(env.TARGET_FALLBACK) || DEFAULT_FALLBACK_TARGET,
        debugView: env.DEBUG_VIEW === "1" || env.DEBUG_VIEW === "true",
        adminUsername: env.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME,
        updatedAt: null,
        source: "env",
    };
}

export function decideRedirect(country, config) {
    const normalizedCountry = normalizeCountry(country);
    const allowed = isAllowedCountry(normalizedCountry, config.allowedCountries);
    return {
        allowed,
        country: normalizedCountry,
        target: allowed ? config.targetAllowed : config.targetFallback,
    };
}

export function getVisitorCountry(request) {
    const headerCountry = normalizeCountry(request.headers.get("CF-IPCountry"));
    const cfCountry = normalizeCountry(request.cf && request.cf.country);

    if (isLocalRequest(request) && headerCountry) {
        return headerCountry;
    }

    if (cfCountry) {
        return cfCountry;
    }

    return headerCountry;
}

export function isAllowedCountry(country, allowedCountries) {
    const normalizedCountry = normalizeCountry(country);
    if (!normalizedCountry || normalizedCountry === "XX" || normalizedCountry === "T1") {
        return false;
    }

    return allowedCountries.includes(normalizedCountry);
}

export function normalizeCountry(value) {
    const country = String(value || "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(country) || country === "T1") {
        return country;
    }

    return "";
}

export function normalizeCountries(value, fallback = []) {
    const parsed = parseCountryValues(value);
    if (parsed.countries.length > 0) {
        return parsed.countries;
    }

    return Array.isArray(fallback) ? [...fallback] : [];
}

function parseCountryValues(value) {
    const countries = [];
    const invalidCodes = [];
    const seen = new Set();

    for (const token of splitCountryTokens(value)) {
        const code = normalizeCountry(token);
        if (!isConfigurableCountryCode(code)) {
            invalidCodes.push(token);
            continue;
        }

        if (!seen.has(code)) {
            seen.add(code);
            countries.push(code);
        }
    }

    return { countries, invalidCodes };
}

function splitCountryTokens(value) {
    const values = Array.isArray(value) ? value : [value];
    return values
        .flatMap((item) => String(item || "").split(/[\s,;]+/))
        .map((item) => item.trim())
        .filter(Boolean);
}

function isConfigurableCountryCode(code) {
    return /^[A-Z]{2}$/.test(code) && code !== "XX";
}

function normalizeTargetUrl(value) {
    const text = String(value || "").trim();
    if (!text) {
        return "";
    }

    try {
        const url = new URL(text);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
            return "";
        }

        return url.toString();
    } catch {
        return "";
    }
}

function isLocalRequest(request) {
    try {
        const hostname = new URL(request.url).hostname;
        return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
    } catch {
        return false;
    }
}

async function readStoredConfig(env) {
    if (!env.REDIRECT_CONFIG || typeof env.REDIRECT_CONFIG.get !== "function") {
        return null;
    }

    try {
        const raw = await env.REDIRECT_CONFIG.get(CONFIG_KV_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch (error) {
        console.error("Failed to read redirect config", error);
        return null;
    }
}

async function saveStoredConfig(env, config) {
    if (!env.REDIRECT_CONFIG || typeof env.REDIRECT_CONFIG.put !== "function") {
        return {
            ok: false,
            error: "KV binding REDIRECT_CONFIG is not configured.",
        };
    }

    try {
        await env.REDIRECT_CONFIG.put(CONFIG_KV_KEY, JSON.stringify(config, null, 2));
        return { ok: true };
    } catch (error) {
        console.error("Failed to save redirect config", error);
        return {
            ok: false,
            error: "Failed to save config to KV.",
        };
    }
}

async function handleAdmin(request, env, config, url) {
    if (!env.ADMIN_PASSWORD) {
        return adminUnavailableResponse();
    }

    if (url.pathname === "/admin-login") {
        if (request.method === "GET" || request.method === "HEAD") {
            return new Response(null, {
                status: 303,
                headers: {
                    Location: "/admin",
                    "Cache-Control": "no-store",
                },
            });
        }

        if (request.method !== "POST") {
            return methodNotAllowed("GET, HEAD, POST");
        }

        const form = await request.formData();
        const username = String(form.get("username") || "");
        const password = String(form.get("password") || "");

        if (!isValidAdminCredentials(username, password, config.adminUsername, env.ADMIN_PASSWORD)) {
            return loginPageResponse({
                username,
                error: "Invalid username or password.",
                status: 401,
            });
        }

        return new Response(null, {
            status: 303,
            headers: {
                Location: "/admin",
                "Set-Cookie": await createAdminSessionCookie(config.adminUsername, env.ADMIN_PASSWORD, request),
                "Cache-Control": "no-store",
            },
        });
    }

    if (url.pathname === "/admin-logout") {
        return new Response(null, {
            status: 303,
            headers: {
                Location: "/admin",
                "Set-Cookie": clearAdminSessionCookie(),
                "Cache-Control": "no-store",
            },
        });
    }

    const auth = await getAdminAuthState(request, config.adminUsername, env.ADMIN_PASSWORD);
    if (!auth.authorized) {
        if (hasBasicAuthorization(request)) {
            return unauthorizedResponse();
        }

        return loginPageResponse({
            username: config.adminUsername,
        });
    }

    if (request.method === "GET" || request.method === "HEAD") {
        return adminPageResponse({
            config,
            saved: url.searchParams.get("saved") === "1",
        });
    }

    if (request.method !== "POST") {
        return methodNotAllowed("GET, HEAD, POST");
    }

    const form = await request.formData();
    const validation = validateAdminForm(form);

    if (!validation.ok) {
        return adminPageResponse({
            config: {
                ...config,
                allowedCountries: validation.values.allowedCountries,
                targetAllowed: validation.values.targetAllowed,
                targetFallback: validation.values.targetFallback,
            },
            errors: validation.errors,
            status: 400,
        });
    }

    const nextConfig = {
        allowedCountries: validation.values.allowedCountries,
        targetAllowed: validation.values.targetAllowed,
        targetFallback: validation.values.targetFallback,
        updatedAt: new Date().toISOString(),
    };
    const saved = await saveStoredConfig(env, nextConfig);

    if (!saved.ok) {
        return adminPageResponse({
            config: {
                ...config,
                ...nextConfig,
            },
            errors: [saved.error],
            status: 500,
        });
    }

    return new Response(null, {
        status: 303,
        headers: {
            Location: "/admin?saved=1",
            "Cache-Control": "no-store",
        },
    });
}

function validateAdminForm(form) {
    const targetAllowed = normalizeTargetUrl(form.get("targetAllowed"));
    const targetFallback = normalizeTargetUrl(form.get("targetFallback"));
    const selectedCountries = form.getAll("allowedCountries");
    const extraCountries = form.get("extraCountries") || "";
    const parsedCountries = parseCountryValues([...selectedCountries, extraCountries]);
    const errors = [];

    if (!targetAllowed) {
        errors.push("A target URL must be a valid http:// or https:// URL.");
    }

    if (!targetFallback) {
        errors.push("C target URL must be a valid http:// or https:// URL.");
    }

    if (parsedCountries.countries.length === 0) {
        errors.push("Select at least one allowed country or region.");
    }

    if (parsedCountries.invalidCodes.length > 0) {
        errors.push(`Invalid country codes: ${parsedCountries.invalidCodes.join(", ")}.`);
    }

    return {
        ok: errors.length === 0,
        errors,
        values: {
            allowedCountries: parsedCountries.countries,
            targetAllowed,
            targetFallback,
        },
    };
}

async function getAdminAuthState(request, expectedUsername, expectedPassword) {
    if (isBasicAuthorized(request, expectedUsername, expectedPassword)) {
        return { authorized: true, method: "basic" };
    }

    const cookieToken = readCookie(request, "redirect_admin_session");
    if (cookieToken) {
        const expectedToken = await createAdminSessionToken(expectedUsername, expectedPassword);
        return {
            authorized: constantTimeEqual(cookieToken, expectedToken),
            method: "cookie",
        };
    }

    return { authorized: false, method: "none" };
}

function hasBasicAuthorization(request) {
    return /^Basic\s+.+$/i.test(request.headers.get("Authorization") || "");
}

function isBasicAuthorized(request, expectedUsername, expectedPassword) {
    const authorization = request.headers.get("Authorization") || "";
    const match = authorization.match(/^Basic\s+(.+)$/i);
    if (!match) {
        return false;
    }

    const decoded = decodeBase64(match[1]);
    const separator = decoded.indexOf(":");
    if (separator === -1) {
        return false;
    }

    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return isValidAdminCredentials(username, password, expectedUsername, expectedPassword);
}

function isValidAdminCredentials(username, password, expectedUsername, expectedPassword) {
    return constantTimeEqual(username, expectedUsername) && constantTimeEqual(password, expectedPassword);
}

async function createAdminSessionCookie(username, password, request) {
    const token = await createAdminSessionToken(username, password);
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return `redirect_admin_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}`;
}

function clearAdminSessionCookie() {
    return "redirect_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

async function createAdminSessionToken(username, password) {
    return sha256Hex(`${username}:${password}`);
}

async function sha256Hex(value) {
    const input = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", input);
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

function readCookie(request, name) {
    const cookieHeader = request.headers.get("Cookie") || "";
    const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
    const prefix = `${name}=`;
    const match = cookies.find((cookie) => cookie.startsWith(prefix));
    return match ? match.slice(prefix.length) : "";
}

function decodeBase64(value) {
    try {
        if (typeof atob === "function") {
            return atob(value);
        }

        if (typeof Buffer !== "undefined") {
            return Buffer.from(value, "base64").toString("utf8");
        }
    } catch {
        return "";
    }

    return "";
}

function constantTimeEqual(actual, expected) {
    const actualText = String(actual || "");
    const expectedText = String(expected || "");
    let result = actualText.length ^ expectedText.length;
    const maxLength = Math.max(actualText.length, expectedText.length);

    for (let index = 0; index < maxLength; index += 1) {
        const actualCode = index < actualText.length ? actualText.charCodeAt(index) : 0;
        const expectedCode = index < expectedText.length ? expectedText.charCodeAt(index) : 0;
        result |= actualCode ^ expectedCode;
    }

    return result === 0;
}

function redirectResponse(target, status = 302) {
    return new Response(null, {
        status,
        headers: {
            Location: target,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });
}

function methodNotAllowed(allow) {
    return new Response("Method Not Allowed", {
        status: 405,
        headers: {
            Allow: allow,
            "Cache-Control": "no-store",
        },
    });
}

function unauthorizedResponse() {
    return new Response("Authentication required.", {
        status: 401,
        headers: {
            "WWW-Authenticate": 'Basic realm="Redirect Admin", charset="UTF-8"',
            "Cache-Control": "no-store",
        },
    });
}

function adminUnavailableResponse() {
    return htmlResponse(renderShell({
        title: "Admin unavailable",
        body: `
          <section class="panel">
            <h1>Admin is not configured</h1>
            <p class="muted">Set the <code>ADMIN_PASSWORD</code> secret before opening this page.</p>
          </section>
        `,
    }), 503);
}

function loginPageResponse({ username = "", error = "", status = 200 } = {}) {
    const body = `
      <section class="login-wrap">
        <div class="login-panel">
          <p class="eyebrow">Cloudflare Worker</p>
          <h1>Redirect Admin</h1>
          <p class="muted">Sign in to update the allowed countries and redirect targets.</p>
          ${error ? `<div class="notice error">${escapeHtml(error)}</div>` : ""}
          <form method="post" action="/admin-login" class="login-form">
            <label for="username">Username</label>
            <input id="username" name="username" type="text" value="${escapeAttribute(username)}" autocomplete="username" required>
            <label for="password">Password</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
            <button type="submit">Sign in</button>
          </form>
        </div>
      </section>
    `;

    return htmlResponse(renderShell({ title: "Redirect Admin Login", body }), status);
}

function adminPageResponse({ config, errors = [], saved = false, status = 200 }) {
    const extraCodes = config.allowedCountries
        .filter((code) => !COUNTRY_OPTION_CODES.has(code))
        .join(", ");
    const countryCheckboxes = COUNTRY_OPTIONS.map(([code, name]) => {
        const checked = config.allowedCountries.includes(code) ? " checked" : "";
        return `
          <label class="country">
            <input type="checkbox" name="allowedCountries" value="${escapeAttribute(code)}"${checked}>
            <span>${escapeHtml(code)}</span>
            <small>${escapeHtml(name)}</small>
          </label>`;
    }).join("");

    const body = `
      <section class="masthead">
        <div>
          <p class="eyebrow">Cloudflare Worker</p>
          <h1>Redirect Admin</h1>
        </div>
        <div class="meta">
          <span>${escapeHtml(config.source.toUpperCase())}</span>
          <span>${escapeHtml(config.updatedAt || "not saved yet")}</span>
        </div>
      </section>
      ${saved ? '<div class="notice success">Configuration saved.</div>' : ""}
      ${errors.length > 0 ? `<div class="notice error">${errors.map((error) => `<p>${escapeHtml(error)}</p>`).join("")}</div>` : ""}
      <form method="post" action="/admin" class="admin-form">
        <section class="field-band">
          <label for="targetAllowed">A target URL</label>
          <input id="targetAllowed" name="targetAllowed" type="url" value="${escapeAttribute(config.targetAllowed)}" required>
        </section>
        <section class="field-band">
          <label for="targetFallback">C target URL</label>
          <input id="targetFallback" name="targetFallback" type="url" value="${escapeAttribute(config.targetFallback)}" required>
        </section>
        <section class="field-band">
          <div class="section-title">
            <label>Allowed countries and regions</label>
            <span>${escapeHtml(config.allowedCountries.length)} selected</span>
          </div>
          <div class="country-grid">${countryCheckboxes}</div>
        </section>
        <section class="field-band">
          <label for="extraCountries">Additional country codes</label>
          <textarea id="extraCountries" name="extraCountries" rows="2" placeholder="CH, AT, BE">${escapeHtml(extraCodes)}</textarea>
        </section>
        <div class="actions">
          <button type="submit">Save configuration</button>
          <a href="/__debug?country=${escapeAttribute(config.allowedCountries[0] || "CN")}">Open debug</a>
          <a href="/admin-logout">Sign out</a>
        </div>
      </form>
    `;

    return htmlResponse(renderShell({ title: "Redirect Admin", body }), status);
}

function debugResponse({ visitorCountry, simulatedCountry, decision, config, requestUrl }) {
    const allowedBadge = decision.allowed ? "ALLOW" : "FALLBACK";
    const sampleAllowed = config.allowedCountries[0] || "CN";
    const sampleDenied = sampleAllowed === "US" ? "CN" : "US";
    const body = `
      <section class="masthead">
        <div>
          <p class="eyebrow">Cloudflare Worker</p>
          <h1>Country Redirect Debug</h1>
        </div>
        <div class="status ${decision.allowed ? "ok" : "deny"}">${escapeHtml(allowedBadge)}</div>
      </section>
      <p class="helper-note">This page is only for local or manual simulation. Public traffic uses Cloudflare geolocation from the visitor IP automatically.</p>
      <section class="debug-grid">
        <div>
          <dt>Detected country</dt>
          <dd><code>${escapeHtml(visitorCountry || "unknown")}</code></dd>
        </div>
        <div>
          <dt>Simulated country</dt>
          <dd><code>${escapeHtml(simulatedCountry || "unknown")}</code></dd>
        </div>
        <div>
          <dt>Allowed countries</dt>
          <dd><code>${escapeHtml(config.allowedCountries.join(", "))}</code></dd>
        </div>
        <div>
          <dt>Redirect target</dt>
          <dd><a href="${escapeAttribute(decision.target)}">${escapeHtml(decision.target)}</a></dd>
        </div>
      </section>
      <div class="actions">
        <a href="${escapeAttribute(debugUrl(requestUrl, sampleAllowed))}">Simulate allowed</a>
        <a href="${escapeAttribute(debugUrl(requestUrl, sampleDenied))}">Simulate fallback</a>
        <a href="/admin">Admin</a>
      </div>
    `;

    return htmlResponse(renderShell({ title: "Country Redirect Debug", body }));
}

function debugUrl(currentUrl, country) {
    const next = new URL(currentUrl.toString());
    next.pathname = "/__debug";
    next.searchParams.set("country", country);
    return next.pathname + next.search;
}

function htmlResponse(html, status = 200) {
    return new Response(html, {
        status,
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });
}

function renderShell({ title, body }) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f7fa;
      color: #152033;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        linear-gradient(180deg, #eef5f3 0, #f8fafc 320px),
        #f8fafc;
    }
    main {
      width: min(1100px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0 44px;
    }
    .masthead {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 24px;
      padding: 30px 0 24px;
      border-bottom: 1px solid #d8e2eb;
    }
    .eyebrow {
      margin: 0 0 8px;
      color: #3f6f68;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      color: #111827;
      font-size: 34px;
      line-height: 1.1;
      letter-spacing: 0;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
      color: #536173;
      font-size: 13px;
    }
    .meta span,
    .status {
      min-height: 32px;
      display: inline-flex;
      align-items: center;
      border: 1px solid #cfd9e5;
      border-radius: 8px;
      padding: 0 10px;
      background: #fff;
      font-weight: 700;
    }
    .status.ok {
      border-color: #9fd6bf;
      background: #e7f8ef;
      color: #0b6846;
    }
    .status.deny {
      border-color: #f2b6b6;
      background: #fff0f0;
      color: #a32020;
    }
    .admin-form {
      display: grid;
      gap: 18px;
      padding-top: 24px;
    }
    .field-band,
    .panel,
    .notice,
    .debug-grid {
      background: #fff;
      border: 1px solid #d9e3ee;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 16px 40px rgba(30, 45, 68, .07);
    }
    label,
    .section-title label {
      display: block;
      margin-bottom: 10px;
      color: #263244;
      font-size: 14px;
      font-weight: 800;
    }
    input[type="url"],
    input[type="text"],
    input[type="password"],
    textarea {
      width: 100%;
      border: 1px solid #b9c8d8;
      border-radius: 8px;
      padding: 12px 13px;
      color: #152033;
      font: inherit;
      line-height: 1.45;
      background: #fbfdff;
    }
    textarea {
      resize: vertical;
    }
    input[type="url"]:focus,
    input[type="text"]:focus,
    input[type="password"]:focus,
    textarea:focus {
      outline: 3px solid rgba(14, 116, 144, .18);
      border-color: #0e7490;
      background: #fff;
    }
    .section-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 12px;
    }
    .section-title label {
      margin: 0;
    }
    .section-title span {
      color: #627084;
      font-size: 13px;
      font-weight: 700;
    }
    .country-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 10px;
    }
    .country {
      display: grid;
      grid-template-columns: 18px 40px 1fr;
      align-items: center;
      gap: 9px;
      min-height: 44px;
      margin: 0;
      border: 1px solid #dde6f0;
      border-radius: 8px;
      padding: 8px 10px;
      background: #fbfdff;
      font-weight: 800;
    }
    .country input {
      width: 16px;
      height: 16px;
      margin: 0;
      accent-color: #0f766e;
    }
    .country small {
      min-width: 0;
      overflow: hidden;
      color: #657386;
      font-size: 12px;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      padding-top: 4px;
    }
    button,
    .actions a {
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #9db0c2;
      border-radius: 8px;
      padding: 0 15px;
      color: #0f3349;
      background: #fff;
      font: inherit;
      font-weight: 800;
      text-decoration: none;
      cursor: pointer;
    }
    button {
      border-color: #0f766e;
      background: #0f766e;
      color: #fff;
    }
    .notice {
      margin-top: 18px;
      font-weight: 800;
    }
    .notice p {
      margin: 0;
    }
    .notice p + p {
      margin-top: 8px;
    }
    .notice.success {
      border-color: #9fd6bf;
      background: #eaf8f0;
      color: #0b6846;
    }
    .notice.error {
      border-color: #f0b0b0;
      background: #fff1f1;
      color: #9b1c1c;
    }
    .panel {
      margin-top: 28px;
    }
    .login-wrap {
      min-height: calc(100vh - 76px);
      display: grid;
      place-items: center;
      padding: 28px 0;
    }
    .login-panel {
      width: min(430px, 100%);
      border: 1px solid #d9e3ee;
      border-radius: 8px;
      padding: 28px;
      background: #fff;
      box-shadow: 0 20px 56px rgba(30, 45, 68, .10);
    }
    .login-panel h1 {
      font-size: 30px;
    }
    .login-form {
      display: grid;
      gap: 12px;
      margin-top: 22px;
    }
    .login-form label {
      margin-bottom: -4px;
    }
    .login-form button {
      width: 100%;
      margin-top: 8px;
    }
    .panel h1 {
      font-size: 28px;
    }
    .helper-note {
      margin: 18px 0 0;
      color: #536173;
      line-height: 1.55;
      font-weight: 700;
    }
    .muted {
      color: #607086;
      line-height: 1.65;
    }
    code {
      border-radius: 6px;
      padding: 2px 6px;
      background: #edf3f8;
      color: #27364a;
      font-family: Consolas, "Courier New", monospace;
    }
    .debug-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin: 24px 0 18px;
    }
    .debug-grid div {
      min-width: 0;
    }
    dt {
      margin: 0 0 8px;
      color: #617086;
      font-size: 13px;
      font-weight: 800;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
      font-weight: 800;
    }
    a {
      color: #0f766e;
    }
    @media (max-width: 700px) {
      main {
        width: min(100% - 24px, 1100px);
        padding-top: 18px;
      }
      .masthead {
        align-items: flex-start;
        flex-direction: column;
      }
      h1 {
        font-size: 28px;
      }
      .field-band,
      .panel,
      .notice,
      .debug-grid {
        padding: 16px;
      }
    }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
    return escapeHtml(value);
}
