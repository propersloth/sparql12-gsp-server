# Security Policy

## Reporting a Vulnerability

This is a small, single-maintainer project. If you find a security issue,
please **do not open a public GitHub issue**. Instead, email
**sean.c.odonnell@gmail.com** with:

- A description of the issue and its potential impact
- Steps to reproduce (a minimal repro is very helpful)
- Any suggested fix, if you have one

You should get an acknowledgment within a few days. There's no bug bounty —
this is a best-effort project — but reports are taken seriously and credited
in the fix commit/release notes unless you ask otherwise.

## Supported Versions

Pre-1.0, unversioned releases. Security fixes land on `main`; there is no
back-porting to older tags at this stage.

## Authentication Model (as of the review in #51)

The server authenticates requests with one of two schemes, implemented in
`src/auth/` (an in-house HMAC-SHA256 implementation — not a third-party JWT
library):

- **Bearer tokens** (`Authorization: Bearer <token>`): a JWT-shaped
  (header.payload.signature, `HS256`) token signed with
  `createHmac('sha256', secret)`, where `secret` comes from
  `GSP_AUTH_JWT_SECRET`. Verification recomputes the HMAC and compares it to
  the provided signature using `crypto.timingSafeEqual` (constant-time),
  not `===`. Tokens carry a 1-hour `exp`, enforced on every verification;
  the issuer (`iss`) claim is also checked against the configured
  `GSP_AUTH_JWT_ISSUER`. The header's `alg`/`typ` are validated against a
  fixed `{alg: 'HS256', typ: 'JWT'}` expectation, so an attacker cannot
  downgrade to `alg: none` or otherwise change the verification algorithm.
- **API keys** (`X-API-Key: <key>`): matched against the comma-separated
  list in `GSP_AUTH_API_KEYS`, again using `crypto.timingSafeEqual` for each
  candidate rather than `===`.

`GSP_AUTH_JWT_SECRET` is required whenever auth is enabled
(`GSP_AUTH_ENABLED`, default `true`); the service now **fails closed** if
the secret is missing or empty rather than silently signing/verifying
tokens with an empty-string HMAC key (see #51 for the incident this closes
in the wiring between `AuthService` and `ConfigService`).

### Known, accepted gaps (documented per #51, not silently missing)

- **No API key rotation or expiry.** A key in `GSP_AUTH_API_KEYS` is valid
  indefinitely until it is removed from the env var and the process is
  restarted. There is no revocation list, no per-key expiry, and no
  automated rotation. Treat API keys as long-lived credentials and rotate
  them manually (edit the env var, restart) if one is suspected leaked.
- **No JWT secret rotation story.** `GSP_AUTH_JWT_SECRET` is a single
  global secret; rotating it invalidates every outstanding token
  immediately (no dual-secret/grace-period support).
- **No built-in rate limiting or abuse protection.** Out of scope for this
  iteration per the URD (`aidlc-docs/inception/requirements/SPARQL12-GSP-URD.md`
  §2.2: "Multi-tenant authn/authz beyond the hooks required to emit
  `401`/`403`" is explicitly excluded). If you deploy this server publicly
  and write-capable, put a reverse proxy or API gateway in front of it that
  provides rate limiting — this server does not protect itself against
  brute-force credential guessing or high-volume abuse.
- **Length-revealing comparison.** Both the JWT-signature and API-key
  comparisons check buffer length before calling `timingSafeEqual` (which
  throws on mismatched lengths). This is the standard/recommended pattern
  for `timingSafeEqual` and only reveals whether the provided value's
  *length* matches a candidate's length, not its content — considered an
  accepted, intentional tradeoff, not a gap.

### Logging

The structured request logger (`src/common/interceptors/logging.interceptor.ts`)
logs method, path, status code, duration, and an extracted graph IRI. It
does not log request headers, so `Authorization` values and API keys are
not written to logs by that interceptor. The global exception filter
(`src/common/filters/gsp-exception.filter.ts`) returns `exception.message`
in error responses; auth guards deliberately catch and normalize all
`AuthService` verification failures (bad signature, expired, malformed,
wrong issuer, wrong algorithm, missing secret, etc.) into a single generic
`401 Invalid or expired token` before they reach the filter, so internal
failure reasons are not distinguishable by a caller and secrets/tokens
never appear in a response body.

## Reference

See GitHub issue #51 for the full review this document is based on.
