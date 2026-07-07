# Unit of Work Dependency Matrix

#normative #inception #reference 

## SPARQL 1.2 Graph Store Protocol Server

> **Amendment log.** Minor updates only: UW-02 (RDF Service) dependency note updated to reflect multi-library approach; UW-04 (Concurrency) dependency note updated from "DB pool" to "TypeORM DataSource"; `patch.service.ts` in file-level dependencies noted as a thin wrapper.

---

## 1. Dependency Matrix

| Unit | UW-01 | UW-02 | UW-03 | UW-04 | UW-05 | UW-06 | UW-07 | UW-08 |
|------|-------|-------|-------|-------|-------|-------|-------|-------|
| **UW-01 Foundation** | — | D | D | D | D | D | D | D |
| **UW-02 RDF Service** | — | — | — | — | D | — | — | — |
| **UW-03 Repositories** | — | — | — | D | D | — | — | — |
| **UW-04 Concurrency** | — | — | — | — | D | — | — | — |
| **UW-05 Graph Store** | — | — | — | — | — | D | — | — |
| **UW-06 Controllers** | — | — | — | — | — | — | — | D |
| **UW-07 Observability** | — | — | — | — | — | — | — | — |
| **UW-08 Integration Tests** | — | — | — | — | — | — | — | — |

**Legend:** D = Dependency

---

## 2. Dependency Details

### UW-01 (Foundation)
- **Depends on:** Nothing (root)
- **Required by:** All other units
- **Note:** Schema uses sentinel IRI `'urn:x-arq:DefaultGraph'` for the default graph row; version column is `BIGINT`; no trigger. See `application-design.md §2`.

### UW-02 (RDF Service)
- **Depends on:** UW-01 (uses database entities and `NormalizedTriple` type)
- **Required by:** UW-05 (core operations need RDF)
- **Note:** Multi-library: N3.js, rdfxml-streaming-parser, in-house `RdfXmlSerializer`, jsonld/jsonld-streaming-parser, sparqljs. GSP-005 records Branch B for RDF/XML serialization because `@rdfjs/serializer-rdfxml` is unavailable on npm.

### UW-03 (Repositories)
- **Depends on:** UW-01 (entities defined)
- **Required by:** UW-04, UW-05
- **Note:** Both repositories expose `*InTxn(manager, ...)` variants for use inside open transactions. `TripleRepository.insert()` uses `ON CONFLICT DO NOTHING` against the unique triple index.

### UW-04 (Concurrency)
- **Depends on:** UW-01 (TypeORM DataSource), UW-03 (repositories)
- **Required by:** UW-05
- **Note:** `ConcurrencyService.lock(manager, iri)` takes a TypeORM `EntityManager` (not a raw `pg.Pool`). `hashGraphId` returns a 48-bit value without `>>> 0` truncation.

### UW-05 (Graph Store Service)
- **Depends on:** UW-02, UW-03, UW-04
- **Required by:** UW-06
- **Note:** All mutations wrapped in `dataSource.transaction()`. `PatchService` must be implemented (thin wrapper over `RdfService`) before this unit is complete — NestJS DI will fail at startup otherwise.

### UW-06 (Controllers)
- **Depends on:** UW-05
- **Required by:** UW-08
- **Note:** Must include `@All` catch-all handlers for 405 + `Allow`.

### UW-07 (Observability)
- **Depends on:** UW-01
- **Required by:** None (standalone enhancement)

### UW-08 (Integration Tests)
- **Depends on:** UW-06
- **Required by:** None (final deliverable)
- **Note:** G4 and G5 tests use RDFC-1.0 canonical comparison (`rdf-canonize`) and `countDistinctBlankNodes`. G9 concurrency tests require a real Postgres instance (test containers).

---

## 3. File-Level Dependencies

| File | Depends On |
|------|-----------|
| `src/app.module.ts` | All modules |
| `src/database/**/*.ts` | None |
| `src/rdf/rdf.service.ts` | `src/database/entities/*.ts`, multi-library npm packages |
| `src/graph-store/repositories/*.ts` | `src/database/entities/*.ts` |
| `src/graph-store/services/concurrency.service.ts` | TypeORM `DataSource` / `EntityManager` |
| `src/graph-store/services/etag.service.ts` | None (pure unit) |
| `src/graph-store/services/graph-store.service.ts` | Repositories, RdfService, ConcurrencyService, DataSource |
| `src/graph-store/services/patch.service.ts` | `RdfService` (thin wrapper — delegates all logic) |
| `src/graph-store/controllers/*.ts` | GraphStoreService |
| `src/auth/guards/*.ts` | AuthService |
| `src/common/interceptors/*.ts` | Logger, OTel |
| `tests/helpers/rdf.helper.ts` | `RdfService`, `rdf-canonize` |

---

## 4. Test Dependencies

| Test File                         | Unit Under Test | Mock Dependencies                          |
| --------------------------------- | --------------- | ------------------------------------------ |
| `rdf.service.spec.ts`             | UW-02           | None (pure unit)                           |
| `graph.repository.spec.ts`        | UW-03           | Mock TypeORM                               |
| `triple.repository.spec.ts`       | UW-03           | Mock TypeORM                               |
| `concurrency.service.spec.ts`     | UW-04           | Mock EntityManager (not pg pool)           |
| `etag.service.spec.ts`            | UW-04           | None (pure unit)                           |
| `graph-store.service.spec.ts`     | UW-05           | Mock repos, mock services, mock DataSource |
| `graph-store.controller.spec.ts`  | UW-06           | Mock GraphStoreService                     |
| `graph-store.integration.spec.ts` | UW-08           | Real Postgres (test container)             |

---

*Unit dependency matrix amended per pre-construction review.*
