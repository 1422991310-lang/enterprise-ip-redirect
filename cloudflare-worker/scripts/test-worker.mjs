import worker, {
    decideRedirect,
    isAllowedCountry,
    normalizeCountries,
    readConfig,
} from "../src/index.js";

const baseEnv = {
    ALLOWED_COUNTRIES: "cn,SG",
    TARGET_ALLOWED: "https://a.example.com/internal-page",
    TARGET_FALLBACK: "https://c.example.com/access-info",
    DEBUG_VIEW: "1",
};

const envConfig = await readConfig(baseEnv);

assertDeepEqual(envConfig.allowedCountries, ["CN", "SG"], "env countries are normalized");
assertEqual(isAllowedCountry("CN", envConfig.allowedCountries), true, "allowed country is allowed");
assertEqual(isAllowedCountry("US", envConfig.allowedCountries), false, "non-allowlist country is denied");
assertEqual(isAllowedCountry("XX", ["XX", "CN"]), false, "unknown country code is always denied");
assertEqual(isAllowedCountry("T1", ["T1", "CN"]), false, "Tor country code is always denied");
assertDeepEqual(normalizeCountries("cn, sg us"), ["CN", "SG", "US"], "country parser accepts comma and whitespace");
assertEqual(decideRedirect("cn", envConfig).target, baseEnv.TARGET_ALLOWED, "allowed country redirects to A");
assertEqual(decideRedirect("US", envConfig).target, baseEnv.TARGET_FALLBACK, "denied country redirects to C");
assertEqual(decideRedirect("", envConfig).target, baseEnv.TARGET_FALLBACK, "missing country redirects to C");

const allowedResponse = await worker.fetch(new Request("https://b.example.com/", {
    headers: {
        "CF-IPCountry": "CN",
    },
}), baseEnv);

assertEqual(allowedResponse.status, 302, "allowed response returns 302");
assertEqual(allowedResponse.headers.get("Location"), baseEnv.TARGET_ALLOWED, "allowed response location is A");
assertEqual(allowedResponse.headers.get("Cache-Control"), "no-store", "redirect response is not cached");

const deniedResponse = await worker.fetch(new Request("https://b.example.com/", {
    headers: {
        "CF-IPCountry": "US",
    },
}), baseEnv);

assertEqual(deniedResponse.status, 302, "denied response returns 302");
assertEqual(deniedResponse.headers.get("Location"), baseEnv.TARGET_FALLBACK, "denied response location is C");

const debugResponse = await worker.fetch(new Request("https://b.example.com/__debug?country=CN", {
    headers: {
        "CF-IPCountry": "US",
    },
}), baseEnv);

assertEqual(debugResponse.status, 200, "debug page returns 200");
assertEqual(debugResponse.headers.get("Content-Type").includes("text/html"), true, "debug page returns HTML");
assertEqual((await debugResponse.text()).includes("CN"), true, "debug page includes simulated country");

const adminWithoutPassword = await worker.fetch(new Request("https://b.example.com/admin"), baseEnv);
assertEqual(adminWithoutPassword.status, 503, "admin is unavailable without ADMIN_PASSWORD");

const secureEnv = {
    ...baseEnv,
    ADMIN_PASSWORD: "secret",
    REDIRECT_CONFIG: createMemoryKv(),
};

const loginPage = await worker.fetch(new Request("https://b.example.com/admin"), secureEnv);
assertEqual(loginPage.status, 200, "admin opens a browser login page without credentials");
assertEqual((await loginPage.text()).includes("Redirect Admin"), true, "login page renders");

const unauthorizedAdmin = await worker.fetch(new Request("https://b.example.com/admin", {
    headers: {
        Authorization: basicAuth("admin", "wrong"),
    },
}), secureEnv);

assertEqual(unauthorizedAdmin.status, 401, "wrong admin password is rejected");
assertEqual(unauthorizedAdmin.headers.get("WWW-Authenticate").startsWith("Basic "), true, "admin returns a Basic challenge");

const failedLogin = await worker.fetch(new Request("https://b.example.com/admin-login", {
    method: "POST",
    headers: {
        "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody({
        username: "admin",
        password: "wrong",
    }),
}), secureEnv);

assertEqual(failedLogin.status, 401, "wrong form login is rejected");
assertEqual((await failedLogin.text()).includes("Invalid username or password."), true, "failed form login renders an error");

const loginResponse = await worker.fetch(new Request("https://b.example.com/admin-login", {
    method: "POST",
    headers: {
        "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody({
        username: "admin",
        password: "secret",
    }),
}), secureEnv);

assertEqual(loginResponse.status, 303, "valid form login redirects to admin");
assertEqual(loginResponse.headers.get("Location"), "/admin", "valid form login redirects to admin page");

const adminCookie = loginResponse.headers.get("Set-Cookie").split(";")[0];
const cookieAdmin = await worker.fetch(new Request("https://b.example.com/admin", {
    headers: {
        Cookie: adminCookie,
    },
}), secureEnv);

assertEqual(cookieAdmin.status, 200, "session cookie opens admin page");
assertEqual((await cookieAdmin.text()).includes("Save configuration"), true, "session admin page renders the config form");

const authorizedAdmin = await worker.fetch(new Request("https://b.example.com/admin", {
    headers: {
        Authorization: basicAuth("admin", "secret"),
    },
}), secureEnv);

assertEqual(authorizedAdmin.status, 200, "correct admin password opens the form");
assertEqual((await authorizedAdmin.text()).includes("Redirect Admin"), true, "admin page renders");

const invalidAdminSave = await worker.fetch(new Request("https://b.example.com/admin", {
    method: "POST",
    headers: {
        Authorization: basicAuth("admin", "secret"),
        "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody({
        targetAllowed: "not-a-url",
        targetFallback: "https://c.example.com/access-info",
        allowedCountries: ["CN"],
    }),
}), secureEnv);

assertEqual(invalidAdminSave.status, 400, "invalid admin form returns 400");

const saveResponse = await worker.fetch(new Request("https://b.example.com/admin", {
    method: "POST",
    headers: {
        Authorization: basicAuth("admin", "secret"),
        "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody({
        targetAllowed: "https://new-a.example.com/",
        targetFallback: "https://new-c.example.com/",
        allowedCountries: ["CN", "SG"],
        extraCountries: "hk",
    }),
}), secureEnv);

assertEqual(saveResponse.status, 303, "valid admin form redirects after save");
assertEqual(saveResponse.headers.get("Location"), "/admin?saved=1", "valid admin form redirects to saved page");

const storedConfig = JSON.parse(await secureEnv.REDIRECT_CONFIG.get("redirect-config"));
assertDeepEqual(storedConfig.allowedCountries, ["CN", "SG", "HK"], "admin save writes normalized countries to KV");
assertEqual(storedConfig.targetAllowed, "https://new-a.example.com/", "admin save writes A target");
assertEqual(storedConfig.targetFallback, "https://new-c.example.com/", "admin save writes C target");

const kvConfig = await readConfig(secureEnv);
assertDeepEqual(kvConfig.allowedCountries, ["CN", "SG", "HK"], "KV config overrides env countries");
assertEqual(kvConfig.source, "kv", "KV config marks source");

const kvAllowedResponse = await worker.fetch(new Request("https://b.example.com/", {
    headers: {
        "CF-IPCountry": "HK",
    },
}), secureEnv);

assertEqual(kvAllowedResponse.status, 302, "KV allowed response returns 302");
assertEqual(kvAllowedResponse.headers.get("Location"), "https://new-a.example.com/", "KV country config redirects to saved A");

const kvDeniedResponse = await worker.fetch(new Request("https://b.example.com/", {
    headers: {
        "CF-IPCountry": "US",
    },
}), secureEnv);

assertEqual(kvDeniedResponse.status, 302, "KV denied response returns 302");
assertEqual(kvDeniedResponse.headers.get("Location"), "https://new-c.example.com/", "KV country config redirects to saved C");

console.log("Worker tests passed.");

function createMemoryKv(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        async get(key) {
            return store.get(key) || null;
        },
        async put(key, value) {
            store.set(key, value);
        },
    };
}

function basicAuth(username, password) {
    return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function formBody(values) {
    const body = new URLSearchParams();

    for (const [key, value] of Object.entries(values)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                body.append(key, item);
            }
            continue;
        }

        body.set(key, value);
    }

    return body;
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
}

function assertDeepEqual(actual, expected, message) {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);

    if (actualJson !== expectedJson) {
        throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
    }
}
