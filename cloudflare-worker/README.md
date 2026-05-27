# Cloudflare Worker Country Redirect Admin

This Worker makes the B domain a configurable country/region redirect entrypoint:

- Visitors from allowed countries/regions: `B -> A`
- All other visitors: `B -> C`
- Redirect status: `302`
- Country source: Cloudflare `request.cf.country`, with `CF-IPCountry` as the local test fallback
- Runtime configuration: `/admin`, protected by a web login form
- Storage: Cloudflare KV binding `REDIRECT_CONFIG`

## What You Need

- A B domain managed by Cloudflare: `netfly.ecinf.xyz`.
- The full A target URL: `https://github.com/1422991310-lang`.
- The full C fallback URL: `https://www.cloudflare.com/`.
- The country/region codes allowed to reach A: `JP`.
- A Cloudflare account that can deploy Workers and create/bind KV namespaces.
- An admin password stored as the `ADMIN_PASSWORD` Worker secret.

## Configure

Edit `wrangler.jsonc`:

```jsonc
"vars": {
  "ALLOWED_COUNTRIES": "JP",
  "TARGET_ALLOWED": "https://github.com/1422991310-lang",
  "TARGET_FALLBACK": "https://www.cloudflare.com/",
  "ADMIN_USERNAME": "admin",
  "DEBUG_VIEW": "0"
},
"kv_namespaces": [
  {
    "binding": "REDIRECT_CONFIG"
  }
]
```

`ALLOWED_COUNTRIES` is only the first-deploy fallback. After deployment, the `/admin` page saves the live configuration into KV.

Set the admin password:

```powershell
npm.cmd exec wrangler secret put ADMIN_PASSWORD
```

For production on your B domain, add a route or Custom Domain after replacing the examples:

```jsonc
"route": {
  "pattern": "netfly.ecinf.xyz/*",
  "zone_name": "ecinf.xyz"
}
```

With current Wrangler versions, a KV namespace can be created from a binding that omits `id` during deploy. If your Cloudflare account or Wrangler version requires an explicit namespace ID, create one and paste the returned ID into `wrangler.jsonc`:

```powershell
npm.cmd exec wrangler kv namespace create REDIRECT_CONFIG
```

```jsonc
"kv_namespaces": [
  {
    "binding": "REDIRECT_CONFIG",
    "id": "paste-kv-namespace-id-here"
  }
]
```

## Run Locally

```powershell
npm install
npm.cmd run dev
```

Open:

```text
http://127.0.0.1:8787/__debug?country=JP
```

The debug page lets you simulate an allowed or denied country without changing your real location.

## Test Redirects

Allowed country:

```powershell
curl.exe -I -H "CF-IPCountry: JP" http://127.0.0.1:8787/
```

Expected: `302` with `Location: https://github.com/1422991310-lang`.

Denied country:

```powershell
curl.exe -I -H "CF-IPCountry: US" http://127.0.0.1:8787/
```

Expected: `302` with `Location: https://www.cloudflare.com/`.

Run the automated tests:

```powershell
npm.cmd test
```

## Use the Admin Page

1. Deploy the Worker and set `ADMIN_PASSWORD`.
2. Open `https://netfly.ecinf.xyz/admin`.
3. Log in with username `admin` unless `ADMIN_USERNAME` was changed. The password is the `ADMIN_PASSWORD` secret.
4. Fill in A target URL, C fallback URL, and allowed countries/regions.
5. Save. The Worker stores the config in KV under `redirect-config`.

For local development, create `.dev.vars` with:

```text
ADMIN_PASSWORD=local-secret
```

If `ADMIN_PASSWORD` is not configured, `/admin` returns an unavailable page and normal redirects continue to use environment defaults. Scripted clients can still use HTTP Basic Auth with the same username and password.

## Deploy

```powershell
npm install
npm.cmd run deploy
```

Wrangler will ask you to log in to Cloudflare if needed.

For the full public deployment checklist, including B domain routing, A target URLs that are bare IP addresses, and production verification, see `PUBLIC_DEPLOYMENT.md`.

## Important

Protect A directly with VPN, SSO, Cloudflare Access, private networking, or an equivalent server-side rule. This Worker controls the B entrypoint only; users who know A can otherwise bypass B.

Country/region detection depends on Cloudflare IP geolocation. `XX` means unknown and `T1` means Tor; both are always sent to C by this Worker.
