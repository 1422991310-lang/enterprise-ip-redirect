# Country-Based Redirect Gateway

This repository contains a Cloudflare Worker entrypoint for this flow:

- User opens the B domain.
- Cloudflare Worker reads the visitor country/region from Cloudflare geolocation.
- Allowed countries/regions receive a `302` redirect to A.
- All other countries/regions receive a `302` redirect to C.
- A built-in `/admin` login page lets you update A, C, and the allowed country list without editing code.

The active implementation is in `cloudflare-worker/`.

Current production defaults:

- B entry domain: `https://netfly.ecinf.xyz/`
- Current generated D link: `https://enterprise-country-redirect.netfly-ecinf.workers.dev/`
- Allowed country/region: `JP`
- A target URL: `https://github.com/1422991310-lang`
- C fallback URL: `https://www.cloudflare.com/`

## Cloudflare Worker

Key files:

- `cloudflare-worker/src/index.js`: Worker redirect logic, `/admin`, and `/__debug`.
- `cloudflare-worker/wrangler.jsonc`: Worker variables, KV binding, and deployment route.
- `cloudflare-worker/scripts/test-worker.mjs`: Local tests for country redirects, admin auth, and KV saves.

Prepare these values before deployment:

- B domain, currently `netfly.ecinf.xyz`.
- A target URL for allowed visitors.
- C fallback URL for all other visitors.
- Allowed country/region codes, currently `JP`.
- Cloudflare Worker KV binding named `REDIRECT_CONFIG`.
- Worker secret named `ADMIN_PASSWORD`.

See `cloudflare-worker/README.md` for the full setup and deployment steps.

For public production deployment, including B domain routing and A-as-IP notes, see `cloudflare-worker/PUBLIC_DEPLOYMENT.md`.

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
