param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$configPath = Join-Path $Root "nginx\conf.d\enterprise-redirect.conf"
$allowlistPath = Join-Path $Root "nginx\conf.d\enterprise-allowlist.conf"

if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Missing config file: $configPath"
}

if (-not (Test-Path -LiteralPath $allowlistPath)) {
    throw "Missing allowlist file: $allowlistPath"
}

$config = Get-Content -LiteralPath $configPath -Raw
$allowlist = Get-Content -LiteralPath $allowlistPath -Raw

$requiredPatterns = @(
    'geo\s+\$enterprise_allowed_ip',
    'map\s+\$enterprise_allowed_ip\s+\$enterprise_redirect_target',
    'return\s+302\s+\$enterprise_redirect_target;',
    'return\s+308\s+https://b\.example\.com\$request_uri;',
    'log_format\s+enterprise_redirect',
    'access_log\s+/var/log/nginx/enterprise_redirect_access\.log\s+enterprise_redirect;'
)

foreach ($pattern in $requiredPatterns) {
    if ($config -notmatch $pattern) {
        throw "Config check failed. Missing expected pattern: $pattern"
    }
}

if ($allowlist -notmatch '(?m)^\s*(\d{1,3}\.){3}\d{1,3}/\d{1,2}\s+1;') {
    throw "Allowlist check failed. Add at least one IPv4 CIDR line such as: 203.0.113.10/32 1;"
}

Write-Host "Static checks passed for enterprise redirect config."

$nginx = Get-Command nginx -ErrorAction SilentlyContinue
if ($null -eq $nginx) {
    Write-Host "nginx was not found locally. Run 'nginx -t' on the deployment host after installing the config and TLS certificate."
} else {
    Write-Host "nginx found at $($nginx.Source). Run syntax validation on the deployment host with: nginx -t"
}
