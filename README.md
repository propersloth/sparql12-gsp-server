# SPARQL 1.2 Graph Store Protocol Server

NestJS + TypeScript implementation of a SPARQL 1.2 Graph Store Protocol server.

> [!IMPORTANT]
> Milestones M1 Foundation, M2 Data Layer, and M3 Core Logic are complete. The server now handles the full set of Graph Store Protocol HTTP methods (GET, HEAD, PUT, POST, DELETE, PATCH) across both direct and indirect graph addressing modes.

## Table of contents

- [Project status](#project-status)
- [M1 foundation deliverables](#m1-foundation-deliverables)
- [M2 data layer deliverables](#m2-data-layer-deliverables)
- [M3 core logic deliverables](#m3-core-logic-deliverables)
- [Current HTTP surface](#current-http-surface)
- [What is not implemented yet](#what-is-not-implemented-yet)
- [Quick start (developer)](#quick-start-developer)
- [Configuration](#configuration)
- [NPM scripts](#npm-scripts)
- [Testing](#testing)
- [Project map](#project-map)

## Project status

This repository is a functioning SPARQL 1.2 Graph Store Protocol server. It includes:

- NestJS application bootstrap and runtime wiring
- Environment validation and configuration transformation
- TypeORM PostgreSQL integration with migrations
- Graph and triple persistence model
- RDF parsing and serialization for all six supported media types
- Graph and triple repositories with transactional writes
- Concurrency lock and ETag services
- Content negotiation and IRI routing
- Full GSP HTTP controller (GET, HEAD, PUT, POST, DELETE, PATCH)
- SPARQL 1.1 Update–based PATCH with graph-scope enforcement
- Unit coverage for all protocol operations

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
| ETag service + invalid ETag exception | `/src/graph-store/services/etag.service.ts`, `/src/graph-store/exceptions/invalid-etag.exception.ts` | Complete |
| Data layer unit coverage | `/tests/unit/**/*` | Complete |

## M3 core logic deliverables

| Deliverable | Path | Status |
| --- | --- | --- |
| GSP HTTP controller | `/src/graph-store/graph-store.controller.ts` | Complete |
| Graph store service | `/src/graph-store/services/graph-store.service.ts` | Complete |
| Content negotiation service | `/src/graph-store/services/content-negotiation.service.ts` | Complete |
| Graph routing service | `/src/graph-store/services/graph-routing.service.ts` | Complete |
| PATCH service (SPARQL 1.1 Update) | `/src/graph-store/services/patch.service.ts` | Complete |
| PATCH media-type exception filter | `/src/graph-store/filters/patch-media-type.filter.ts` | Complete |
| PATCH unsupported media-type exception | `/src/graph-store/exceptions/patch-unsupported-media-type.exception.ts` | Complete |
| Core logic unit coverage | `/tests/unit/**/*`, `/tests/integration/**/*` | Complete |

## Current HTTP surface

### Graph Store Protocol endpoints

Each method is available on both a **direct** path (`/graph/:iri`) and an **indirect** path (`/graph-store` with a `?graph=<iri>` or `?default` query parameter).

| Method | Direct path | Indirect path | Semantics |
| --- | --- | --- | --- |
| `GET` | `/graph/:iri` | `/graph-store?graph=<iri>` | Retrieve a named graph |
| `GET` | — | `/graph-store?default` | Retrieve the default graph |
| `HEAD` | `/graph/:iri` | `/graph-store?graph=<iri>` | Retrieve metadata for a named graph |
| `HEAD` | — | `/graph-store?default` | Retrieve metadata for the default graph |
| `PUT` | `/graph/:iri` | `/graph-store?graph=<iri>` | Replace a named graph |
| `PUT` | — | `/graph-store?default` | Replace the default graph |
| `POST` | `/graph/:iri` | `/graph-store?graph=<iri>` | Merge triples into a named graph |
| `POST` | — | `/graph-store` | Create a new graph with a minted IRI |
| `DELETE` | `/graph/:iri` | `/graph-store?graph=<iri>` | Delete a named graph |
| `DELETE` | — | `/graph-store?default` | Clear the default graph |
| `PATCH` | `/graph/:iri` | `/graph-store?graph=<iri>` | Apply a SPARQL 1.1 Update to a named graph |
| `PATCH` | — | `/graph-store?default` | Apply a SPARQL 1.1 Update to the default graph |

### Other endpoints

| Route | Purpose |
| --- | --- |
| `GET /health` | Liveness check returning `{ status, timestamp }` |

## What is not implemented yet

- Auth enforcement (JWT validation and API key checking are configured but not applied at the request level)
- OpenTelemetry observability pipeline

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
| `GSP_PATCH_ENABLED` | No | `true` | Configured but not yet enforced at the request level. |
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
- RDF parsing, serialization, merge, and patch application
- RDF/XML serialization edge cases
- graph and triple repository methods
- concurrency lock and ETag generation
- content negotiation (Accept header parsing, Content-Type validation, sniff-based inference)
- graph routing (direct path, indirect query parameter, IRI validation)
- graph store service (GET, HEAD, PUT, POST, DELETE, PATCH operations)
- PATCH scope enforcement and SPARQL 1.1 Update application

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
  graph-store/
    exceptions/
    filters/
    repositories/
    services/
    graph-store.controller.ts
  health/
  rdf/
    serializers/
  types/
tests/
  unit/
    config/
    database/
    rdf/
    repositories/
  integration/
  helpers/
  fixtures/
aidlc-docs/
  inception/
```
