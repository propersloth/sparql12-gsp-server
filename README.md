# SPARQL 1.2 Graph Store Protocol Server

NestJS + TypeScript implementation of a SPARQL 1.2 Graph Store Protocol server.

> [!IMPORTANT]
> Milestones M1 Foundation, M2 Data Layer, M3 Core Logic, and M4 HTTP Layer are complete. The server now handles the full set of Graph Store Protocol HTTP methods (GET, HEAD, PUT, POST, DELETE, PATCH) across both direct and indirect graph addressing modes, with structured logging, ETag/Vary header injection, a standardized exception filter, and pluggable auth guards.

## Background: the semantic web ecosystem

This project implements a protocol from the W3C's "semantic web" stack — a family of standards for representing and querying data as graphs rather than tables or documents. If you're coming to this repository without that background, here's the minimum you need to make sense of the code and the terminology used throughout the other docs in this repo.

- **RDF (Resource Description Framework)** is the underlying data model. Instead of rows and columns, data is expressed as `subject–predicate–object` **triples** — e.g. `<Alice> <knows> <Bob>`. Subjects and predicates are IRIs (globally unique identifiers, a generalization of URIs); objects can be an IRI, a blank node, or a literal value. A set of triples is an RDF **graph**. A server can host many graphs at once — a **default graph** plus zero or more **named graphs**, each identified by its own IRI — and that collection is called an RDF **dataset** or **Graph Store**. This project's Graph Store is exactly that: a managed collection of named graphs plus a default graph, persisted in PostgreSQL.

- **RDF serialization formats** are the concrete syntaxes used to write RDF triples/datasets to a file or HTTP body. Turtle and N-Triples are compact, human-readable triple formats; RDF/XML is the original XML-based format; JSON-LD expresses RDF using ordinary JSON; TriG and N-Quads extend Turtle and N-Triples respectively to cover multi-graph datasets (they add a fourth "graph name" term to each triple). This server parses, merges, and serializes across all six of these — the "mandatory trio" of RDF/XML, Turtle, and N-Triples, plus JSON-LD, TriG, and N-Quads — and negotiates between them using standard HTTP `Accept` / `Content-Type` headers.

- **SPARQL** is the query and update language for RDF, playing a role analogous to SQL for relational databases. **SPARQL Query** retrieves data by matching triple patterns against a dataset; **SPARQL Update** adds an imperative layer (`INSERT DATA`, `DELETE DATA`, `INSERT`/`DELETE`/`WHERE`, and graph management operations) for modifying a Graph Store. This project implements a *subset* of SPARQL Update internally to support its `PATCH` method, but it does not expose the full SPARQL Query/Update HTTP endpoints — see below.

- **The Graph Store Protocol (GSP)** is the specification this server actually implements. Where full SPARQL Query/Update requires clients to send SPARQL syntax over a dedicated protocol endpoint, GSP exposes graph-level CRUD as plain HTTP verbs — `GET`/`HEAD` to read a graph, `PUT` to replace it, `POST` to merge triples into it or mint a new one, `DELETE` to remove it, and (optionally) `PATCH` to apply an incremental SPARQL Update. It's deliberately the "REST-shaped" on-ramp into an RDF store: simpler to implement and consume than the full SPARQL protocol, at the cost of not supporting arbitrary queries.

- **OWL (Web Ontology Language)** sits a layer above RDF and is mentioned here for completeness, since it's part of the same standards family. OWL adds vocabulary for defining classes, properties, and logical constraints over RDF data, enabling reasoning and inference (e.g. "if X is a `Parent` and a `Doctor`, infer X is a `WorkingParent`"). This server does not perform OWL reasoning or entailment — it stores and serves triples as given, treating ontology semantics as the client's concern.

**Where this project fits:** it is the storage and transport layer of the semantic web stack — the part responsible for durably persisting RDF graphs and letting clients get them in and out over HTTP with correct concurrency, content negotiation, and status-code semantics — without taking a position on query complexity (that's SPARQL Query/Update's job) or on inference (that's OWL's job). It exists because a static-file server can move opaque bytes but can't satisfy the RDF-semantic obligations of the spec — chiefly the `POST` = *RDF merge* operation, parse-and-validate behavior, and serialization-level content negotiation. Meeting those obligations requires an RDF-aware application server that hosts a parser, serializer, and store in-process, which is what this repository builds.

### Relevant W3C specifications

| Specification                                                           | Purpose                                                            | Link                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| SPARQL 1.2 Graph Store Protocol (W3C Working Draft)                     | The protocol this server implements                                | <https://www.w3.org/TR/sparql12-graph-store-protocol/> |
| RDF 1.2 Concepts and Abstract Data Model (W3C Candidate Recommendation) | The core RDF data model (triples, graphs, datasets)                | <https://www.w3.org/TR/rdf12-concepts/>                |
| RDF 1.2 Semantics                                                       | Formal semantics and entailment regimes for RDF                    | <https://www.w3.org/TR/rdf12-semantics/>               |
| RDF 1.2 Turtle                                                          | The Turtle serialization syntax                                    | <https://www.w3.org/TR/rdf12-turtle/>                  |
| RDF 1.2 N-Triples                                                       | The N-Triples serialization syntax                                 | <https://www.w3.org/TR/rdf12-n-triples/>               |
| RDF 1.2 N-Quads                                                         | The N-Quads (dataset) serialization syntax                         | <https://www.w3.org/TR/rdf12-n-quads/>                 |
| RDF 1.2 TriG                                                            | The TriG (dataset) serialization syntax                            | <https://www.w3.org/TR/rdf12-trig/>                    |
| RDF 1.2 XML Syntax                                                      | The RDF/XML serialization syntax                                   | <https://www.w3.org/TR/rdf12-xml/>                     |
| JSON-LD 1.1                                                             | The JSON-based RDF serialization syntax                            | <https://www.w3.org/TR/json-ld11/>                     |
| SPARQL 1.2 Query Language (W3C Working Draft)                           | Query language for RDF                                             | <https://www.w3.org/TR/sparql12-query/>                |
| SPARQL 1.2 Update (W3C Working Draft)                                   | Update language for RDF (basis for this server's `PATCH` support)  | <https://www.w3.org/TR/sparql12-update/>               |
| SPARQL 1.2 Protocol (W3C Working Draft)                                 | The full HTTP protocol for SPARQL Query/Update (distinct from GSP) | <https://www.w3.org/TR/sparql12-protocol/>             |
| OWL 2 Web Ontology Language, Document Overview (Second Edition)         | Overview of the OWL 2 ontology language family                     | <https://www.w3.org/TR/owl2-overview/>                 |

> [!NOTE]
> Several of the SPARQL 1.2 and RDF 1.2 documents above are still W3C Working Drafts or Candidate Recommendations, actively evolving under the RDF & SPARQL Working Group. This project tracks the SPARQL 1.2 Graph Store Protocol Working Draft of 19 December 2024 as its conformance baseline (see `SPARQL12-GSP-URD.md`); check the W3C's [technical reports index](https://www.w3.org/TR/) for the latest revisions before relying on any of these as final.

## Table of contents

- [Background: the semantic web ecosystem](#background-the-semantic-web-ecosystem)
- [Project status](#project-status)
- [Current HTTP surface](#current-http-surface)
- [What is not implemented yet](#what-is-not-implemented-yet)
- [Quick start (developer)](#quick-start-developer)
- [Configuration](#configuration)
- [NPM scripts](#npm-scripts)
- [Testing](#testing)
- [Project map](#project-map)

## Project status

This repository is a functioning SPARQL 1.2 Graph Store Protocol server. Milestones M1 (Foundation), M2 (Data Layer), M3 (Core Logic), and M4 (HTTP Layer) are complete, covering:

- NestJS application bootstrap, configuration, and PostgreSQL persistence (graphs, triples, migrations)
- RDF parsing and serialization across all six supported media types, with transactional repositories and concurrency/ETag services
- The full GSP HTTP controller (GET, HEAD, PUT, POST, DELETE, PATCH) with content negotiation, graph routing, and SPARQL 1.1 Update–based PATCH
- Auth service and pluggable guards (JWT, API key, optional read bypass), structured logging, OTel-ready tracing, ETag/`Vary` header injection, and a standardized exception filter
- Unit and integration coverage for all of the above

<details>
<summary><strong>M1 — Foundation</strong></summary>

| Deliverable | Path |
| --- | --- |
| Application bootstrap | `/src/main.ts`, `/src/app.module.ts` |
| Environment schema + transforms | `/src/config/*` |
| PostgreSQL entities | `/src/database/entities/*` |
| Database migrations | `/src/database/migrations/*` |
| TypeORM runtime configuration | `/src/database/database.config.ts` |
| Health endpoint | `/src/health/health.controller.ts` |
| RDF/XML serializer utility | `/src/rdf/serializers/rdfxml.serializer.ts` |
| Test fixtures + infrastructure specs | `/tests/*` |
| Inception and architecture artifacts | `/aidlc-docs/inception/*` |

</details>

<details>
<summary><strong>M2 — Data Layer</strong></summary>

| Deliverable | Path |
| --- | --- |
| RDF service contract + implementation | `/src/rdf/rdf.service.ts` |
| RDF exception model | `/src/rdf/rdf.exceptions.ts` |
| Graph repository | `/src/graph-store/repositories/graph.repository.ts` |
| Triple repository | `/src/graph-store/repositories/triple.repository.ts` |
| Concurrency service | `/src/graph-store/services/concurrency.service.ts` |
| ETag service + invalid ETag exception | `/src/graph-store/services/etag.service.ts`, `/src/graph-store/exceptions/invalid-etag.exception.ts` |
| Data layer unit coverage | `/tests/unit/**/*` |

</details>

<details>
<summary><strong>M3 — Core Logic</strong></summary>

| Deliverable | Path |
| --- | --- |
| GSP HTTP controller | `/src/graph-store/graph-store.controller.ts` |
| Graph store service | `/src/graph-store/services/graph-store.service.ts` |
| Content negotiation service | `/src/graph-store/services/content-negotiation.service.ts` |
| Graph routing service | `/src/graph-store/services/graph-routing.service.ts` |
| PATCH service (SPARQL 1.1 Update) | `/src/graph-store/services/patch.service.ts` |
| PATCH media-type exception filter | `/src/graph-store/filters/patch-media-type.filter.ts` |
| PATCH unsupported media-type exception | `/src/graph-store/exceptions/patch-unsupported-media-type.exception.ts` |
| Core logic unit coverage | `/tests/unit/**/*`, `/tests/integration/**/*` |

</details>

<details>
<summary><strong>M4 — HTTP Layer</strong></summary>

| Deliverable | Path |
| --- | --- |
| Auth service (JWT + API-key, in-house HMAC-SHA256) | `/src/auth/auth.service.ts` |
| JWT guard | `/src/auth/guards/jwt-auth.guard.ts` |
| API-key guard | `/src/auth/guards/api-key.guard.ts` |
| Optional auth guard (read bypass) | `/src/auth/guards/optional-auth.guard.ts` |
| Structured logging interceptor | `/src/common/interceptors/logging.interceptor.ts` |
| OTel-ready tracing interceptor | `/src/common/interceptors/tracing.interceptor.ts` |
| ETag + `Vary: Accept` interceptor | `/src/common/interceptors/etag.interceptor.ts` |
| GSP exception filter (named error-to-status map) | `/src/common/filters/gsp-exception.filter.ts` |
| Method-not-allowed filter | `/src/common/filters/method-not-allowed.filter.ts` |
| M4 unit coverage | `/tests/unit/auth/auth.spec.ts`, `/tests/unit/common/*`, `/tests/unit/interceptors.spec.ts` |
| M4 integration coverage | `/tests/integration/controllers.spec.ts`, `/tests/integration/headers.spec.ts` |

</details>

## Current HTTP surface

### Graph Store Protocol endpoints

Each method is available on both a **direct** path (`/graph/:iri`) and an **indirect** path (`/graph-store` with a `?graph=<iri>` or `?default` query parameter).

| Method   | Direct path   | Indirect path              | Semantics                                      |
| -------- | ------------- | -------------------------- | ---------------------------------------------- |
| `GET`    | `/graph/:iri` | `/graph-store?graph=<iri>` | Retrieve a named graph                         |
| `GET`    | —             | `/graph-store?default`     | Retrieve the default graph                     |
| `HEAD`   | `/graph/:iri` | `/graph-store?graph=<iri>` | Retrieve metadata for a named graph            |
| `HEAD`   | —             | `/graph-store?default`     | Retrieve metadata for the default graph        |
| `PUT`    | `/graph/:iri` | `/graph-store?graph=<iri>` | Replace a named graph                          |
| `PUT`    | —             | `/graph-store?default`     | Replace the default graph                      |
| `POST`   | `/graph/:iri` | `/graph-store?graph=<iri>` | Merge triples into a named graph               |
| `POST`   | —             | `/graph-store`             | Create a new graph with a minted IRI           |
| `DELETE` | `/graph/:iri` | `/graph-store?graph=<iri>` | Delete a named graph                           |
| `DELETE` | —             | `/graph-store?default`     | Clear the default graph                        |
| `PATCH`  | `/graph/:iri` | `/graph-store?graph=<iri>` | Apply a SPARQL 1.1 Update to a named graph     |
| `PATCH`  | —             | `/graph-store?default`     | Apply a SPARQL 1.1 Update to the default graph |

### Other endpoints

| Route | Purpose |
| --- | --- |
| `GET /health` | Liveness check returning `{ status, timestamp }` |

## What is not implemented yet

- Auth route enforcement (guards implemented; `@UseGuards` wiring to controller routes is pending)
- OpenTelemetry observability pipeline (tracing interceptor stub in place; full OTel SDK initialization and exporter configuration is M5)

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
| `GSP_PATCH_ENABLED` | No | `true` | Controls whether `Accept-Patch` is advertised in OPTIONS responses. |
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
- auth guards (JWT, API-key, optional read bypass)
- HTTP interceptors (logging, tracing, ETag and Vary injection)
- GSP exception filter (named exception-to-status mapping)
- controller routing and HTTP method dispatch (direct, indirect, minted)

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
  auth/
    guards/
  common/
    filters/
    interceptors/
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
    auth/
    common/
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

---
This project is licensed under the [MIT License](./LICENSE).
