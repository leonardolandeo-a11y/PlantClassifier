# Security and credential rotation

Current source contains no known real Wi-Fi/database credentials. Each sketch includes an ignored `wifi_config.h`; tracked `wifi_config.example.h` files contain placeholders. `.env` and firmware local configuration are ignored and excluded from images. Device tokens and operator passwords are required at startup. The targeted `scripts/check-secrets.py` guard checks the previously affected locations without printing values; it is not a complete secret-detection product.

## Required manual actions before deployment

1. Rotate the Wi-Fi passwords embedded in previous versions of **both** sketches. Reconfigure all devices that use those networks.
2. Rotate the PostgreSQL password previously present in `application.properties` (the historical `.env` blob inspected was empty). Update the actual database role as well as the local environment; editing `POSTGRES_PASSWORD` does not change a role in an existing Docker volume.
3. Review other deployments and local configuration privately for reused credentials. Never paste their values into issues, PRs or logs.
4. Generate independent operator and device credentials, for example using `openssl rand -hex 32`, and enter them only into local configuration. Set `DEVICE_TOKEN` identically in Spring and both firmware configurations.
5. Restrict access to `.env` and `wifi_config.h`. Protect the robot network and use an HTTPS reverse proxy plus `SESSION_COOKIE_SECURE=true` when browser traffic leaves localhost.

Historical evidence (commit identifiers only):

- Physical firmware credentials: `25f9655`, `4514a22`.
- Simulation firmware credentials: `25f9655`, `bb376da`, `ff893e8`, `25cabdc`, `17be401`, `f383d20`.
- Database fallback: `25f9655`, `bb376da`, `ff893e8`.
- `.env` was tracked in older history; the available blob in `ff893e8` is empty and does not establish another secret exposure. It is ignored now.

Rotation is necessary even if history is cleaned. After rotating, repository owners should consider a coordinated historical cleanup with a dedicated secret-removal procedure, accounting for forks, clones, cached PR diffs and collaborator branches. **This change does not rewrite history, force-push, change external credentials or delete existing database volumes.**

## Trust model and remaining limits

Spring uses a single configured OPERATOR account, BCrypt password hashing, an HttpOnly same-site session cookie, and default Spring Security CSRF protection. The browser obtains a session-bound CSRF token from `/csrf`; it never receives the backend device token. Authorization applies to movement/session acquisition and sensor APIs. `/login` is the standard Spring Security form; static assets remain public.

The ESP32 requires `X-Device-Token` on control acquisition, movement, diagnostics, status and capture. Token comparison avoids early content-dependent exits. The physical `/test` route is absent unless explicitly enabled. No CORS permission is granted.

ESP32 HTTP is **not encrypted**: a shared token authenticates clients but cannot protect against interception or an active attacker on an untrusted network. Use a trusted isolated Wi-Fi/VLAN with firewall rules allowing only the backend to reach ESP32 HTTP. Do not forward ESP32 or PostgreSQL ports publicly. Secure device provisioning or TLS-capable firmware is future work; this PR does not claim that bare HTTP provides confidentiality.

The watchdog and ordered protocol reduce software hazards; they cannot guarantee motor stoppage if hardware, firmware scheduling, power circuitry or Wi-Fi/WebServer handling fails. Provide a physical emergency stop and validate with wheels raised. PWM acknowledgements are commanded state, never measured motion.
