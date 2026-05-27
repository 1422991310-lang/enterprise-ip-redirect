const DEFAULT_ALLOWED_IPS = "203.0.113.10,198.51.100.20";
const DEFAULT_ALLOWED_TARGET = "https://a.example.com/internal-page";
const DEFAULT_FALLBACK_TARGET = "https://c.example.com/access-info";

export default {
    async fetch(request, env = {}) {
        const url = new URL(request.url);
        const config = readConfig(env);
        const clientIp = getClientIp(request);

        if (url.pathname === "/__debug" && config.debugView) {
            const simulatedIp = url.searchParams.get("ip") || clientIp;
            const decision = decideRedirect(simulatedIp, config);
            return debugResponse({
                clientIp,
                simulatedIp,
                decision,
                config,
                requestUrl: url,
            });
        }

        if (request.method !== "GET" && request.method !== "HEAD") {
            return new Response("Method Not Allowed", {
                status: 405,
                headers: {
                    Allow: "GET, HEAD",
                    "Cache-Control": "no-store",
                },
            });
        }

        const decision = decideRedirect(clientIp, config);
        console.log(JSON.stringify({
            clientIp,
            allowed: decision.allowed,
            target: decision.target,
            url: request.url,
        }));

        return Response.redirect(decision.target, 302);
    },
};

export function readConfig(env = {}) {
    return {
        allowedIps: splitCsv(env.ALLOWED_IPS || DEFAULT_ALLOWED_IPS),
        allowedTarget: env.TARGET_ALLOWED || DEFAULT_ALLOWED_TARGET,
        fallbackTarget: env.TARGET_FALLBACK || DEFAULT_FALLBACK_TARGET,
        debugView: env.DEBUG_VIEW === "1" || env.DEBUG_VIEW === "true",
    };
}

export function decideRedirect(clientIp, config) {
    const allowed = isAllowedIp(clientIp, config.allowedIps);
    return {
        allowed,
        target: allowed ? config.allowedTarget : config.fallbackTarget,
    };
}

export function getClientIp(request) {
    const cloudflareIp = request.headers.get("CF-Connecting-IP");
    if (cloudflareIp) {
        return cloudflareIp.trim();
    }

    const forwardedFor = request.headers.get("X-Forwarded-For");
    if (forwardedFor) {
        return forwardedFor.split(",")[0].trim();
    }

    return "127.0.0.1";
}

export function isAllowedIp(clientIp, rules) {
    if (!clientIp) {
        return false;
    }

    return rules.some((rule) => ipMatchesRule(clientIp, rule));
}

function ipMatchesRule(clientIp, rule) {
    if (!rule) {
        return false;
    }

    if (!rule.includes("/")) {
        return clientIp === rule;
    }

    return matchesIpv4Cidr(clientIp, rule);
}

function matchesIpv4Cidr(clientIp, cidr) {
    const [networkIp, prefixText] = cidr.split("/");
    const prefix = Number(prefixText);

    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
        return false;
    }

    const client = ipv4ToNumber(clientIp);
    const network = ipv4ToNumber(networkIp);

    if (client === null || network === null) {
        return false;
    }

    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (client & mask) === (network & mask);
}

function ipv4ToNumber(ip) {
    const parts = ip.split(".");
    if (parts.length !== 4) {
        return null;
    }

    let value = 0;
    for (const part of parts) {
        if (!/^\d+$/.test(part)) {
            return null;
        }

        const octet = Number(part);
        if (octet < 0 || octet > 255) {
            return null;
        }

        value = ((value << 8) + octet) >>> 0;
    }

    return value >>> 0;
}

function splitCsv(value) {
    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function debugResponse({ clientIp, simulatedIp, decision, config, requestUrl }) {
    const allowedBadge = decision.allowed ? "ALLOW" : "FALLBACK";
    const sampleAllowed = config.allowedIps[0] || "203.0.113.10";
    const sampleDenied = "8.8.8.8";

    return new Response(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cloudflare Worker IP 白名单预览</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Arial, "Microsoft YaHei", sans-serif;
      background: #f6f8fb;
      color: #172033;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 32px;
      box-sizing: border-box;
    }
    main {
      width: min(920px, 100%);
      background: #fff;
      border: 1px solid #dbe3ef;
      border-radius: 8px;
      box-shadow: 0 18px 60px rgba(20, 35, 60, .10);
      overflow: hidden;
    }
    header {
      padding: 28px 32px;
      background: #0f766e;
      color: #fff;
    }
    h1 {
      margin: 0;
      font-size: 26px;
      line-height: 1.25;
      letter-spacing: 0;
    }
    .subtitle {
      margin-top: 8px;
      opacity: .92;
      line-height: 1.55;
    }
    section {
      padding: 28px 32px;
    }
    .status {
      display: inline-flex;
      align-items: center;
      height: 36px;
      padding: 0 14px;
      border-radius: 999px;
      font-weight: 700;
      background: ${decision.allowed ? "#d1fae5" : "#fee2e2"};
      color: ${decision.allowed ? "#065f46" : "#991b1b"};
    }
    dl {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 14px 18px;
      margin: 24px 0 0;
    }
    dt {
      color: #5b6678;
      font-weight: 700;
    }
    dd {
      margin: 0;
      word-break: break-word;
    }
    code {
      font-family: Consolas, "Courier New", monospace;
      background: #eef3f8;
      padding: 3px 6px;
      border-radius: 5px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 28px;
    }
    a {
      color: #0f766e;
      font-weight: 700;
      text-decoration: none;
    }
    .button {
      display: inline-flex;
      align-items: center;
      min-height: 40px;
      padding: 0 14px;
      border: 1px solid #b9c7d8;
      border-radius: 7px;
      background: #fff;
    }
    @media (max-width: 640px) {
      body {
        padding: 16px;
      }
      header, section {
        padding: 22px;
      }
      dl {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Cloudflare Worker IP 白名单跳转预览</h1>
      <div class="subtitle">这个页面只用于调试查看；正式访问 B 域名时会直接 302 跳转。</div>
    </header>
    <section>
      <div class="status">${escapeHtml(allowedBadge)}</div>
      <dl>
        <dt>Cloudflare 识别 IP</dt>
        <dd><code>${escapeHtml(clientIp)}</code></dd>
        <dt>当前模拟 IP</dt>
        <dd><code>${escapeHtml(simulatedIp)}</code></dd>
        <dt>白名单</dt>
        <dd><code>${escapeHtml(config.allowedIps.join(", "))}</code></dd>
        <dt>命中结果</dt>
        <dd>${decision.allowed ? "指定 IP，跳转到 A" : "非指定 IP，跳转到 C"}</dd>
        <dt>跳转目标</dt>
        <dd><a href="${escapeAttribute(decision.target)}">${escapeHtml(decision.target)}</a></dd>
      </dl>
      <div class="actions">
        <a class="button" href="${escapeAttribute(debugUrl(requestUrl, sampleAllowed))}">模拟允许 IP</a>
        <a class="button" href="${escapeAttribute(debugUrl(requestUrl, sampleDenied))}">模拟非允许 IP</a>
        <a class="button" href="/">测试真实 302 跳转</a>
      </div>
    </section>
  </main>
</body>
</html>`, {
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });
}

function debugUrl(currentUrl, ip) {
    const next = new URL(currentUrl.toString());
    next.pathname = "/__debug";
    next.searchParams.set("ip", ip);
    return next.pathname + next.search;
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
