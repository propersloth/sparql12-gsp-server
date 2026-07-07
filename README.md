# SPARQL 1.2 Graph Store Protocol Server

NestJS + TypeScript implementation of a SPARQL 1.2 Graph Store Protocol server.

> [!IMPORTANT]
> Milestone M1 Foundation and M2 Data Layer are complete. The repository now contains the application foundation, configuration system, PostgreSQL schema/migrations, RDF service, repository layer, and concurrency/ETag services. Graph Store Protocol request handling is the next major implementation phase.

## Table of contents

- [Project status](#project-status)
- [M1 foundation deliverables](#m1-foundation-deliverables)
- [M2 data layer deliverables](#m2-data-layer-deliverables)
- [Current HTTP surface](#current-http-surface)
- [What is not implemented yet](#what-is-not-implemented-yet)
- [Quick start (developer)](#quick-start-developer)
- [Configuration](#configuration)
- [NPM scripts](#npm-scripts)
- [Testing](#testing)
- [Project map](#project-map)

## Project status

This repository is no longer just a scaffold. It already includes:

- NestJS application bootstrap and runtime wiring
- Environment validation and configuration transformation
- TypeORM PostgreSQL integration with migrations
- Graph and triple persistence model
- RDF parsing/serialization service implementations
- Graph and triple repositories
- Concurrency lock and ETag services
- RDF/XML serialization utilities with unit coverage
- Test fixtures and infrastructure for upcoming protocol work

The server is still pre-feature for the SPARQL 1.2 Graph Store Protocol itself: the data and service layer foundation is present, but protocol endpoints and the HTTP request lifecycle are not wired yet.

## M1 foundation deliverables

| Deliverable | Path | Status |
| --- | --- | --- |
| Application bootstrap | `/src/main.ts`, `/src/app.module.ts` | Complete |
| Environment schema + transforms | `/src/config/*` | Complete |
| PostgreSQL entities | `/src/database/entities/*` | Complete |
| Database migrations | `/src/database/migrations/*` | Complete |
| TypeORM runtime configuration | `/src/database/database.config.ts` | Complete |
| Health endpoint | `/src/health/health.controller.ts` | Complete |
| RDF/XML serializer utility | `/src/rdf/serializers/rdfxml.serializer.ts` | Complete |
| Test fixtures + infrastructure specs | `/tests/*` | Complete |
| Inception and architecture artifacts | `/aidlc-docs/inception/*` | Complete |

## M2 data layer deliverables

| Deliverable | Path | Status |
| --- | --- | --- |
| RDF service contract + implementation | `/src/rdf/rdf.service.ts` | Complete |
| RDF exception model | `/src/rdf/rdf.exceptions.ts` | Complete |
| Graph repository | `/src/graph-store/repositories/graph.repository.ts` | Complete |
| Triple repository | `/src/graph-store/repositories/triple.repository.ts` | Complete |
| Concurrency service | `/src/graph-store/services/concurrency.service.ts` | Complete |
| ETag service + invalid etag exception | `/src/graph-store/services/etag.service.ts`, `/src/graph-store/exceptions/invalid-etag.exception.ts` | Complete |
| Data layer unit coverage | `/tests/unit/**/*` | Complete |

## Current HTTP surface

| Route | Purpose |
| --- | --- |
| `GET /health` | Liveness check returning `{ status, timestamp }` |

## What is not implemented yet

- SPARQL 1.2 Graph Store Protocol routes and request lifecycle
- HTTP controller integration for RDF/service/repository layers
- Auth enforcement and request-level protocol behavior (including PATCH semantics)

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
| `GSP_DATABASE_POOL_MAX` | No | `10` | Maximum TypeORM/PostgreSQL pool size. |
| `GSP_BASE_URL` | No | `http://localhost:3000` | Public server base URL. |
| `GSP_AUTH_ENABLED` | No | `true` | Accepts `true/false/1/0`. |
| `GSP_AUTH_JWT_SECRET` | Conditional | — | Required unless auth is disabled. |
| `GSP_AUTH_API_KEYS` | No | empty | Comma-delimited API key list. |
| `GSP_PATCH_ENABLED` | No | `true` | Reserved for future PATCH protocol support. |
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
| `npm test` | Execute Jest tests in-band (schema migration suite excluded by default). |
| `npm run test:schema` | Execute the DB-backed schema migration suite only. |
| `npm run test:cov` | Execute Jest tests with coverage output. |

## Testing

```bash
npm test
```

Current automated coverage includes:

- configuration validation and payload-size parsing
- database schema and migrations
- infrastructure bootstrap and fixture availability
- RDF/XML serialization edge cases

> [!NOTE]
> `npm test` intentionally excludes `tests/unit/database/schema.spec.ts` because that suite requires a reachable PostgreSQL instance.
> To run the schema suite explicitly:
> ```bash
> TEST_DATABASE_URL=postgresql://<username>:<password>@localhost:5432/gsp_test npm run test:schema
> ```

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
    entities/
    migrations/
  health/
  rdf/
    serializers/
tests/
  unit/
  helpers/
  fixtures/
aidlc-docs/
  inception/
```
