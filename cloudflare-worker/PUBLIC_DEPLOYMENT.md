# Public Deployment Guide

Use this guide when the redirect is live on the public Internet:

- Public visitors receive only the B entry link.
- Cloudflare Worker detects the visitor country from the visitor IP.
- Allowed countries/regions are redirected to A.
- Everyone else is redirected to C.

Local debug URLs such as `?country=IN` are only for simulation. Public visitors do not need that parameter.

## 1. Prepare Values

Prepare these production values before deploying:

```text
B domain:        https://b.example.com/
A target URL:   https://adsagent.ecinf.cn/
C fallback URL: https://example.com/not-allowed
Allowed codes:  IN, JP, CN, SG
Admin username: admin
Admin password: choose a strong password
```

If A is a bare IP address, use `http://1.2.3.4/` only when the A server really serves HTTP on that IP. Avoid `https://1.2.3.4/` unless the certificate is valid for that IP. A domain with HTTPS is strongly preferred.

## 2. Bind Worker to B Domain

In `wrangler.jsonc`, replace the commented route example with your real B domain:

```jsonc
"route": {
  "pattern": "b.example.com/*",
  "zone_name": "example.com"
}
```

Make sure the B domain is in Cloudflare DNS and proxied through Cloudflare.

## 3. Configure Defaults

The first deployment can use environment defaults. These are later overridden by the `/admin` page and saved in KV.

```jsonc
"vars": {
  "ALLOWED_COUNTRIES": "IN,JP",
  "TARGET_ALLOWED": "https://adsagent.ecinf.cn/",
  "TARGET_FALLBACK": "https://example.com/not-allowed",
  "ADMIN_USERNAME": "admin",
  "DEBUG_VIEW": "0"
}
```

Set `DEBUG_VIEW` to `"0"` for production unless you intentionally want the debug page public.

## 4. Configure KV and Secret

Keep the existing KV binding:

```jsonc
"kv_namespaces": [
  {
    "binding": "REDIRECT_CONFIG"
  }
]
```

Set the admin password as a Cloudflare secret:

```powershell
cd cloudflare-worker
npm.cmd exec wrangler secret put ADMIN_PASSWORD
```

## 5. Deploy

```powershell
cd cloudflare-worker
npm install
npm.cmd run deploy
```

After deployment, open:

```text
https://b.example.com/admin
```

Log in, set A URL, C URL, and allowed countries/regions, then save.

## 6. Public Use

Publish only the B entry link:

```text
https://b.example.com/
```

Expected behavior:

- Visitor country is allowed: browser receives `302 Location: A`.
- Visitor country is not allowed: browser receives `302 Location: C`.
- Unknown country `XX` or Tor `T1`: browser receives `302 Location: C`.

## 7. Protect A

The Worker protects only the B entry path. If users can discover and open A directly, they can bypass B.

Use one or more of these protections on A:

- Require login on A.
- Put A behind Cloudflare Access.
- Restrict A at the origin firewall.
- If A is behind Cloudflare, add matching country or access rules there too.
- Avoid exposing the raw origin IP when possible.
