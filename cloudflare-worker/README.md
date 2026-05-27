# Cloudflare Worker Enterprise IP Redirect

This Worker implements a transparent enterprise entrypoint:

- Allowed public IPs: `B -> A`
- Other IPs: `B -> C`
- Redirect status: `302`
- Client IP source: Cloudflare `CF-Connecting-IP`

## Configure

Edit `wrangler.jsonc`:

```jsonc
"vars": {
  "ALLOWED_IPS": "203.0.113.10,198.51.100.20",
  "TARGET_ALLOWED": "https://a.example.com/internal-page",
  "TARGET_FALLBACK": "https://c.example.com/access-info",
  "DEBUG_VIEW": "1"
}
```

Use comma-separated fixed public IPs or IPv4 CIDR ranges:

```text
203.0.113.10
198.51.100.0/24
```

For production, replace the route comment in `wrangler.jsonc` with your B domain:

```jsonc
"route": {
  "pattern": "b.example.com/*",
  "zone_name": "example.com"
}
```

Set `DEBUG_VIEW` to `"0"` before production deployment if you do not want the `/__debug` preview page available.

## Run Locally

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:8787/__debug?ip=203.0.113.10
```

The debug page lets you simulate an allowed or denied IP without changing your real network.

## Test Redirects

Allowed IP:

```bash
curl -I -H "CF-Connecting-IP: 203.0.113.10" http://127.0.0.1:8787/
```

Expected: `302` with `Location: https://a.example.com/internal-page`.

Denied IP:

```bash
curl -I -H "CF-Connecting-IP: 8.8.8.8" http://127.0.0.1:8787/
```

Expected: `302` with `Location: https://c.example.com/access-info`.

## Deploy

```bash
npm install
npm run deploy
```

Wrangler will ask you to log in to Cloudflare if needed.

## Important

Protect A directly with VPN, SSO, Cloudflare Access, private networking, or an equivalent server-side rule. This Worker controls the B entrypoint only.
