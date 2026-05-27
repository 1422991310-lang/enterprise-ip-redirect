# Enterprise IP Allowlist Redirect

This repository contains an Nginx-based enterprise access entrypoint:

- Allowed public IPs: `B -> A`
- All other IPs: `B -> C`
- Redirects use `302` so browsers and intermediaries do not permanently cache the decision.

## Files

- `nginx/conf.d/enterprise-redirect.conf`: Nginx redirect gateway config.
- `nginx/conf.d/enterprise-allowlist.conf`: Fixed public IP/CIDR allowlist.
- `scripts/validate-enterprise-redirect.ps1`: Local static validation helper.

## Configure

Before deployment, replace these placeholders in `nginx/conf.d/enterprise-redirect.conf`:

- `b.example.com`: the public B entry domain.
- `https://a.example.com/internal-page`: the protected internal destination A.
- `https://c.example.com/access-info`: the public fallback destination C.
- `/etc/nginx/certs/b.example.com/fullchain.pem` and `privkey.pem`: the TLS certificate paths for B.

Then replace the example IP ranges in `nginx/conf.d/enterprise-allowlist.conf` with your office or VPN public egress IPs:

```nginx
203.0.113.10/32 1;
198.51.100.20/32 1;
```

## Deploy

On the Nginx host:

```bash
sudo cp nginx/conf.d/enterprise-redirect.conf /etc/nginx/conf.d/enterprise-redirect.conf
sudo cp nginx/conf.d/enterprise-allowlist.conf /etc/nginx/conf.d/enterprise-allowlist.conf
sudo nginx -t
sudo systemctl reload nginx
```

Make sure the main Nginx config includes `/etc/nginx/conf.d/*.conf` from inside the `http` block.

## Verify

From an allowed network:

```bash
curl -I https://b.example.com/
```

Expected result: `HTTP/2 302` with `Location: https://a.example.com/internal-page`.

From a non-allowed network:

```bash
curl -I https://b.example.com/
```

Expected result: `HTTP/2 302` with `Location: https://c.example.com/access-info`.

Check logs:

```bash
sudo tail -f /var/log/nginx/enterprise_redirect_access.log
```

Each line includes `allowed=1` or `allowed=0` and the selected redirect target.

## Important

This gateway controls the B entrypoint only. Keep A protected with VPN, SSO, private networking, or a matching server-side access rule so users cannot bypass B by opening A directly.

## Cloudflare Worker Version

A Cloudflare Worker implementation is available in `cloudflare-worker/`.

It uses Cloudflare's `CF-Connecting-IP` header, supports exact public IPv4 addresses and IPv4 CIDR ranges, and includes a local `/__debug` preview page for testing allowed and denied IP behavior before deployment.
