# SPARQL 1.2 Graph Store Protocol Server

NestJS + TypeScript implementation of a SPARQL 1.2 Graph Store Protocol server.

> [!IMPORTANT]
> This repository is in active development. Core platform artifacts exist (configuration, DB schema, health endpoint, test scaffolding), while GSP endpoint behavior is still being implemented.

## Table of contents

- [Current repository artifacts](#current-repository-artifacts)
- [Implementation status](#implementation-status)
- [Quick start (developer)](#quick-start-developer)
- [Configuration](#configuration)
- [NPM scripts](#npm-scripts)
- [Testing](#testing)
- [Project map](#project-map)

## Current repository artifacts

| Artifact | Path | Purpose |
| --- | --- | --- |
| Application bootstrap | `/src/main.ts`, `/src/app.module.ts` | Starts NestJS app, wires config and optional DB module. |
| Health endpoint | `/src/health/health.controller.ts` | `GET /health` liveness endpoint returning status + timestamp. |
| Configuration model + validation | `/src/config/*` | Environment parsing, validation, defaults, payload-size parsing. |
| Database integration | `/src/database/*` | TypeORM config, entities, and initial PostgreSQL schema migration. |
| RDF service contract | `/src/rdf/rdf.service.ts` | Parse/serialize interface (currently placeholder methods). |
| Test suite + fixtures | `/tests/*` | Unit/infrastructure tests plus RDF/adversarial fixtures. |
| Inception artifacts | `/aidlc-docs/inception/*` | Requirements, architecture, risk analysis, and testing matrix docs. |
| Runtime env template | `/.env.example` | Example environment variables for local development. |

## Implementation status

- [x] NestJS application bootstrap
- [x] Health endpoint (`GET /health`)
- [x] Environment schema + transformation rules
- [x] Initial PostgreSQL schema migration + entities
- [x] Baseline test infrastructure and fixtures
- [ ] SPARQL 1.2 Graph Store Protocol endpoint implementation
- [ ] RDF parse/serialize implementation in `RdfService`

## Quick start (developer)

### 1) Install dependencies

```bash
npm ci
```

### 2) Configure environment

```bash
cp .env.example .env
```

Set required values in `.env`:

- `GSP_DATABASE_URL`
- `GSP_AUTH_JWT_SECRET` (required when `GSP_AUTH_ENABLED=true`, the default)

### 3) Run locally

```bash
npm run start:dev
```

Default server URL: `http://localhost:3000`

Health check:

```bash
curl http://localhost:3000/health
```

## Configuration

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `GSP_DATABASE_URL` | Yes | — | PostgreSQL connection string. |
| `GSP_BASE_URL` | No | `http://localhost:3000` | Public server base URL. |
| `GSP_AUTH_ENABLED` | No | `true` | Accepts `true/false/1/0`. |
| `GSP_AUTH_JWT_SECRET` | Conditional | — | Required unless auth is disabled. |
| `GSP_AUTH_API_KEYS` | No | empty | Comma-delimited API key list. |
| `GSP_PATCH_ENABLED` | No | `true` | Accepts `true/false/1/0`. |
| `GSP_OTEL_ENABLED` | No | `false` | Enables OpenTelemetry export. |
| `GSP_OTEL_ENDPOINT` | No | `http://localhost:4318` | OTel collector endpoint. |
| `GSP_OTEL_SERVICE_NAME` | No | `gsp-server` | OTel service name. |
| `GSP_MAX_PAYLOAD_SIZE` | No | `100MB` | Supports `KB`, `MB`, `GB`. |
| `GSP_STREAM_THRESHOLD` | No | `10MB` | Supports `KB`, `MB`, `GB`. |

> [!NOTE]
> `GSP_DEFAULT_GRAPH_PERSISTENT` is retired and intentionally ignored.

## NPM scripts

| Script | Description |
| --- | --- |
| `npm run build` | Compile TypeScript to `/dist`. |
| `npm run start` | Run compiled app from `/dist/main.js`. |
| `npm run start:dev` | Run app directly from TypeScript (`ts-node`). |
| `npm test` | Execute Jest tests in-band. |
| `npm run test:cov` | Execute Jest tests with coverage output. |

## Testing

```bash
npm test
```

> [!WARNING]
> Some schema tests require a reachable PostgreSQL instance (default: `postgresql://<user>:<pass>@localhost:5432/gsp_test` or `TEST_DATABASE_URL`).

<details>
  <summary>Fixture/media coverage currently present in <code>/tests/fixtures</code></summary>

- Turtle (`.ttl`)
- RDF/XML (`.rdf`)
- JSON-LD (`.jsonld`)
- N-Triples (`.nt`)
- N-Quads (`.nq`)
- TriG (`.trig`)
- Adversarial and malformed input samples

</details>

## Project map

```text
src/
  app.module.ts
  main.ts
  config/
  database/
  health/
  rdf/
tests/
  unit/
  fixtures/
  helpers/
aidlc-docs/
  inception/
```
