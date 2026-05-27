import worker, { decideRedirect, isAllowedIp, readConfig } from "../src/index.js";

const env = {
    ALLOWED_IPS: "203.0.113.10,198.51.100.0/24",
    TARGET_ALLOWED: "https://a.example.com/internal-page",
    TARGET_FALLBACK: "https://c.example.com/access-info",
    DEBUG_VIEW: "1",
};

const config = readConfig(env);

assertEqual(isAllowedIp("203.0.113.10", config.allowedIps), true, "exact allowlist IP is allowed");
assertEqual(isAllowedIp("198.51.100.42", config.allowedIps), true, "CIDR allowlist IP is allowed");
assertEqual(isAllowedIp("8.8.8.8", config.allowedIps), false, "non-allowlist IP is denied");
assertEqual(decideRedirect("203.0.113.10", config).target, env.TARGET_ALLOWED, "allowed IP redirects to A");
assertEqual(decideRedirect("8.8.8.8", config).target, env.TARGET_FALLBACK, "denied IP redirects to C");

const allowedResponse = await worker.fetch(new Request("https://b.example.com/", {
    headers: {
        "CF-Connecting-IP": "203.0.113.10",
    },
}), env);

assertEqual(allowedResponse.status, 302, "allowed response returns 302");
assertEqual(allowedResponse.headers.get("Location"), env.TARGET_ALLOWED, "allowed response location is A");

const deniedResponse = await worker.fetch(new Request("https://b.example.com/", {
    headers: {
        "CF-Connecting-IP": "8.8.8.8",
    },
}), env);

assertEqual(deniedResponse.status, 302, "denied response returns 302");
assertEqual(deniedResponse.headers.get("Location"), env.TARGET_FALLBACK, "denied response location is C");

const debugResponse = await worker.fetch(new Request("https://b.example.com/__debug?ip=198.51.100.42", {
    headers: {
        "CF-Connecting-IP": "8.8.8.8",
    },
}), env);

assertEqual(debugResponse.status, 200, "debug page returns 200");
assertEqual(debugResponse.headers.get("Content-Type").includes("text/html"), true, "debug page returns HTML");

console.log("Worker tests passed.");

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
}
