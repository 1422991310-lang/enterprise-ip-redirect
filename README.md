# Country-Based Redirect Gateway

This repository contains a Cloudflare Worker entrypoint for this flow:

- User opens the B domain.
- Cloudflare Worker reads the visitor country/region from Cloudflare geolocation.
- Allowed countries/regions receive a `302` redirect to A.
- All other countries/regions receive a `302` redirect to C.
- A built-in `/admin` login page lets you update A, C, and the allowed country list without editing code.

The active implementation is in `cloudflare-worker/`.

## Cloudflare Worker

Key files:

- `cloudflare-worker/src/index.js`: Worker redirect logic, `/admin`, and `/__debug`.
- `cloudflare-worker/wrangler.jsonc`: Worker variables, KV binding, and deployment route.
- `cloudflare-worker/scripts/test-worker.mjs`: Local tests for country redirects, admin auth, and KV saves.

Prepare these values before deployment:

- B domain, such as `b.example.com`.
- A target URL for allowed visitors.
- C fallback URL for all other visitors.
- Allowed country/region codes, such as `CN`, `SG`, or `HK`.
- Cloudflare Worker KV binding named `REDIRECT_CONFIG`.
- Worker secret named `ADMIN_PASSWORD`.

See `cloudflare-worker/README.md` for the full setup and deployment steps.

## Local Test

```powershell
cd cloudflare-worker
npm install
npm.cmd test
```

## Legacy Nginx Files

The `nginx/` directory contains the previous IP/CIDR allowlist gateway example. It is not used by the Cloudflare Worker country/region admin flow.

## Important

Protect A directly with VPN, SSO, Cloudflare Access, private networking, or an equivalent server-side rule. This gateway controls the B entrypoint only.
