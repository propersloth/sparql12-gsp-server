# Units of Work

#normative #inception #reference 

## SPARQL 1.2 Graph Store Protocol Server

| Field | Value |
|-------|-------|
| **Document type** | AIDLC Units of Work — Parallel Development Units |
| **Status** | Draft |
| **Technology Stack** | NestJS + TypeScript + PostgreSQL |

---

## 1. Unit Overview

Units of Work define parallelizable development tasks that can be executed concurrently by different developers or teams.

### 1.1 Unit Structure

```typescript
interface UnitOfWork {
  id: string;                    // Unique identifier (e.g., "UW-01")
  name: string;                   // Human-readable name
  description: string;           // What this unit delivers
  epic: string;                   // Which epic this supports
  requirements: string[];         // URD requirement IDs covered
  dependencies: string[];         // Unit IDs this depends on
  files: string[];                // Files to be created/modified
  services: string[];             // Services involved
  repositories: string[];          // Repositories involved
  estimatedComplexity: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed';
}
```

---

## 2. Defined Units

### UW-01: Foundation & Database Schema

| Field | Value |
|-------|-------|
| **Name** | Foundation & Database Schema |
| **Description** | Set up NestJS project, PostgreSQL schema, TypeORM configuration, database migrations |
| **Epic** | Infrastructure |
| **Requirements** | NFR-08 (Persistence), CON-02 (HTTP baseline) |
| **Dependencies** | None |
| **Estimated Complexity** | Medium |

**Files:**
```
src/
├── app.module.ts
├── main.ts
├── config/
│   └── configuration.ts
├── database/
│   ├── database.module.ts
│   ├── migrations/
│   │   └── 001-initial-schema.ts
│   └── entities/
│       ├── graph.entity.ts
│       └── triple.entity.ts
```

**Tasks:**
1. Initialize NestJS project with TypeScript
2. Configure TypeORM with PostgreSQL
3. Create Graph entity with version counter
4. Create Triple entity (normalized)
5. Create database migrations
6. Set up connection pooling
7. Add environment configuration

---

### UW-02: RDF Service (N3.js Integration)

| Field | Value |
|-------|-------|
| **Name** | RDF Service (N3.js Integration) |
| **Description** | Implement injectable RDF service for parsing, serialization, and merge |
| **Epic** | E6 (RDF Processing) |
| **Requirements** | UR-RDF-01, UR-RDF-02, UR-RDF-03, UR-RDF-04, UR-FMT-01, UR-FMT-02, UR-FMT-03, UR-FMT-04, UR-FMT-05 |
| **Dependencies** | UW-01 (Foundation) |
| **Estimated Complexity** | High |

**Files:**
```
src/
├── rdf/
│   ├── rdf.module.ts
│   ├── rdf.service.ts
│   ├── rdf.service.spec.ts
│   ├── models/
│   │   ├── triple.model.ts
│   │   └── dataset.model.ts
│   └── parsers/
│       ├── turtle.parser.ts
│       ├── ntriples.parser.ts
│       ├── rdfxml.parser.ts
│       ├── jsonld.parser.ts
│       ├── trig.parser.ts
│       └── nquads.parser.ts
```

**Tasks:**
1. Install and configure N3.js
2. Implement RdfService with parse() method
3. Implement serialize() method for all 6 formats
4. Implement serializeStream() for streaming
5. Implement merge() with blank node standardization
6. Implement parseWithReconciliation() for dataset validation
7. Add format detection for missing Content-Type
8. Write unit tests for all parsers

---

### UW-03: Graph Repository & Triple Repository

| Field | Value |
|-------|-------|
| **Name** | Graph Repository & Triple Repository |
| **Description** | Implement PostgreSQL repositories with CRUD operations |
| **Epic** | E1-E5 (CRUD Operations) |
| **Requirements** | NFR-02 (Concurrency), NFR-08 (Persistence) |
| **Dependencies** | UW-01 (Foundation) |
| **Estimated Complexity** | Medium |

**Files:**
```
src/
├── graph-store/
│   ├── repositories/
│   │   ├── graph.repository.ts
│   │   ├── graph.repository.spec.ts
│   │   ├── triple.repository.ts
│   │   └── triple.repository.spec.ts
```

**Tasks:**
1. Implement GraphRepository.findByIri()
2. Implement GraphRepository.findDefault()
3. Implement GraphRepository.create()
4. Implement GraphRepository.delete()
5. Implement GraphRepository.incrementVersion()
6. Implement TripleRepository.findByGraphId()
7. Implement TripleRepository.findByGraphIdStream()
8. Implement TripleRepository.insert()
9. Implement TripleRepository.deleteByGraphId()
10. Write repository unit tests

---

### UW-04: Concurrency Service & ETag Service

| Field | Value |
|-------|-------|
| **Name** | Concurrency Service & ETag Service |
| **Description** | Implement advisory locks and ETag generation/parsing |
| **Epic** | E11 (Concurrency Control) |
| **Requirements** | UR-CC-01, UR-CC-02, UR-CC-03, UR-CC-04, UR-CC-05, UR-CC-06, UR-CC-07 |
| **Dependencies** | UW-01 (Foundation), UW-03 (Repositories) |
| **Estimated Complexity** | Medium |

**Files:**
```
src/
├── graph-store/
│   └── services/
│       ├── concurrency.service.ts
│       ├── concurrency.service.spec.ts
│       ├── etag.service.ts
│       └── etag.service.spec.ts
```

**Tasks:**
1. Implement ConcurrencyService.withAdvisoryLock()
2. Implement ConcurrencyService.compareVersions()
3. Implement ConcurrencyService.hashGraphId()
4. Implement ETagService.generate()
5. Implement ETagService.parse()
6. Implement ETagService.compare()
7. Write concurrency tests with transaction isolation
8. Test ETag parsing edge cases

---

### UW-05: Graph Store Service (Core Business Logic)

| Field | Value |
|-------|-------|
| **Name** | Graph Store Service (Core Business Logic) |
| **Description** | Implement core GSP operations: GET, HEAD, PUT, POST, DELETE, PATCH |
| **Epic** | E1-E5, E10 (All Methods) |
| **Requirements** | UR-ID-01 to UR-ID-05, UR-GET-01 to UR-GET-05, UR-PUT-01 to UR-PUT-04, UR-POST-01 to UR-POST-06, UR-DEL-01 to UR-DEL-03, UR-PATCH-01 to UR-PATCH-06 |
| **Dependencies** | UW-02 (RDF), UW-03 (Repositories), UW-04 (Concurrency) |
| **Estimated Complexity** | High |

**Files:**
```
src/
├── graph-store/
│   └── services/
│       ├── graph-store.service.ts
│       ├── graph-store.service.spec.ts
│       ├── graph-routing.service.ts
│       ├── graph-routing.service.spec.ts
│       ├── content-negotiation.service.ts
│       ├── content-negotiation.service.spec.ts
│       ├── patch.service.ts
│       └── patch.service.spec.ts
```

**Tasks:**
1. Implement GraphRoutingService.resolveTarget()
2. Implement GraphRoutingService.validateIri()
3. Implement ContentNegotiationService.parseAccept()
4. Implement ContentNegotiationService.getBestMatch()
5. Implement ContentNegotiationService.getDefaultFormat()
6. Implement PatchService.validate()
7. Implement PatchService.parse()
8. Implement PatchService.scopeToGraph()
9. Implement GraphStoreService.getGraph()
10. Implement GraphStoreService.headGraph()
11. Implement GraphStoreService.putGraph()
12. Implement GraphStoreService.postGraph()
13. Implement GraphStoreService.postToStore()
14. Implement GraphStoreService.deleteGraph()
15. Implement GraphStoreService.patchGraph()

---

### UW-06: Controllers & HTTP Layer

| Field | Value |
|-------|-------|
| **Name** | Controllers & HTTP Layer |
| **Description** | Implement NestJS controllers, guards, interceptors |
| **Epic** | E7 (Protocol Correctness) |
| **Requirements** | UR-HTTP-01 to UR-HTTP-05, UR-SEC-01 to UR-SEC-03 |
| **Dependencies** | UW-05 (Graph Store Service) |
| **Estimated Complexity** | Medium |

**Files:**
```
src/
├── graph-store/
│   ├── graph-store.controller.ts
│   ├── graph-store.controller.spec.ts
│   ├── capability.controller.ts
│   └── dtos/
│       ├── graph-store-query.dto.ts
│       └── graph-store-body.dto.ts
├── auth/
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── api-key.guard.ts
│   │   └── optional-auth.guard.ts
│   └── auth.service.ts
├── common/
│   ├── interceptors/
│   │   ├── tracing.interceptor.ts
│   │   ├── logging.interceptor.ts
│   │   └── etag.interceptor.ts
│   ├── filters/
│   │   └── gsp-exception.filter.ts
│   └── decorators/
│       ├── graph-iri.decorator.ts
│       └── conditional-request.decorator.ts
```

**Tasks:**
1. Implement GraphStoreController with all endpoints
2. Implement CapabilityController for OPTIONS
3. Implement DTOs with validation
4. Implement JwtAuthGuard
5. Implement ApiKeyGuard
6. Implement OptionalAuthGuard
7. Implement TracingInterceptor (OTel)
8. Implement LoggingInterceptor (Pino)
9. Implement ETagInterceptor
10. Implement GspExceptionFilter with status mappings
11. Write controller integration tests

---

### UW-07: Observability & Configuration

| Field | Value |
|-------|-------|
| **Name** | Observability & Configuration |
| **Description** | Set up Pino logging, OpenTelemetry, environment configuration |
| **Epic** | NFR (Non-Functional) |
| **Requirements** | NFR-05 (Logging), NFR-06 (IRI Handling) |
| **Dependencies** | UW-01 (Foundation) |
| **Estimated Complexity** | Low |

**Files:**
```
src/
├── config/
│   ├── configuration.ts
│   └── configuration.schema.ts
├── common/
│   └── logging/
│       ├── pino.logger.ts
│       └── otel.setup.ts
```

**Tasks:**
1. Set up Pino with JSON formatting
2. Configure OpenTelemetry SDK
3. Add trace correlation to logs
4. Implement structured log schemas
5. Create configuration validation (Joi/Zod)
6. Document all environment variables

---

### UW-08: Integration Tests & Test Infrastructure

| Field | Value |
|-------|-------|
| **Name** | Integration Tests & Test Infrastructure |
| **Description** | Set up test containers, write GSP compliance tests |
| **Epic** | Testing |
| **Requirements** | G1-G9 (Acceptance Criteria) |
| **Dependencies** | UW-06 (Controllers) |
| **Estimated Complexity** | High |

**Files:**
```
tests/
├── integration/
│   ├── graph-store.integration.spec.ts
│   ├── get.integration.spec.ts
│   ├── put.integration.spec.ts
│   ├── post.integration.spec.ts
│   ├── delete.integration.spec.ts
│   └── patch.integration.spec.ts
├── fixtures/
│   ├── turtle/
│   │   └── sample-graph.ttl
│   ├── rdfxml/
│   │   └── sample-graph.rdf
│   ├── jsonld/
│   │   └── sample-graph.jsonld
│   └── adversarial/
│       └── blank-node-merge.trig
├── test-containers/
│   └── postgres.container.ts
└── test-helpers/
    ├── request.helper.ts
    └── graph.helper.ts
```

**Tasks:**
1. Set up Jest test framework
2. Configure test containers (PostgreSQL)
3. Write GSP compliance tests for each method
4. Test content negotiation edge cases
5. Test RDF merge blank node handling
6. Test concurrency with racing requests
7. Test dataset reconciliation
8. Test ETag conditional requests

---

## 3. Dependency Graph

```
UW-01 (Foundation)
     │
     ├── UW-02 (RDF Service)
     │        │
     │        └── UW-05 (Graph Store Service)
     │                 │
     │                 └── UW-06 (Controllers)
     │                          │
     │                          └── UW-08 (Integration Tests)
     │
     ├── UW-03 (Repositories)
     │        │
     │        └── UW-04 (Concurrency)
     │                 │
     │                 └── UW-05 (Graph Store Service)
     │
     └── UW-07 (Observability)
```

---

## 4. Parallel Development Paths

### Path A: Core GSP Operations (Sequential)
```
UW-01 → UW-03 → UW-04 → UW-02 → UW-05 → UW-06
```

### Path B: Infrastructure (Can Parallelize)
```
UW-01 ──┬── UW-07 (Observability)
         │
         └── Can start UW-02, UW-03 while UW-07 completes
```

### Path C: Testing (Late Start)
```
UW-06 → UW-08
```

---

## 5. Suggested Parallelization

| Team | Units | Rationale |
|------|-------|-----------|
| **Team A** | UW-01, UW-02, UW-05 | Core business logic |
| **Team B** | UW-03, UW-04, UW-06 | HTTP layer |
| **Team C** | UW-07, UW-08 | Testing and observability (can start after UW-01) |

---

## 6. Critical Path

```
UW-01 (Foundation)
    ↓
UW-03 (Repositories)
    ↓
UW-04 (Concurrency)
    ↓
UW-05 (Graph Store Service)
    ↓
UW-06 (Controllers)
    ↓
UW-08 (Integration Tests)
```

**Estimated critical path:** UW-01 → UW-03 → UW-04 → UW-05 → UW-06 → UW-08

---

## 7. Definition of Done

| Unit | Definition of Done |
|------|-------------------|
| UW-01 | PostgreSQL schema created, migrations pass, connection pool working |
| UW-02 | All 6 RDF formats parse and serialize correctly, merge tests pass |
| UW-03 | Repository methods pass unit tests, streaming works |
| UW-04 | Advisory locks prevent race conditions, ETag round-trips work |
| UW-05 | All 7 GSP methods implemented, all unit tests pass |
| UW-06 | Controllers pass integration tests, all status codes correct |
| UW-07 | Logs appear in JSON format, OTel spans correlate |
| UW-08 | All G1-G9 acceptance criteria tests pass |

---

*Units of work per AIDLC Inception Phase*
