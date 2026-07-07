# Component Definitions

#normative #inception #reference 
## SPARQL 1.2 Graph Store Protocol Server

| Field | Value |
|-------|-------|
| **Document type** | AIDLC Application Design — Component Definitions |
| **Status** | Amended |
| **Technology Stack** | NestJS + TypeScript + PostgreSQL |

> **Amendment log.** Updated to match patched issues: (D-01) `Graph.iri` is `string` (not `string | null`), default graph uses sentinel IRI; (D-05) `ConcurrencyService` API changed from `withAdvisoryLock(graphId, fn)` to `lock(manager, iri)`; (D-06) `ETagService.compare` split into `compareStrong` + `compareState`; RdfService expanded with `triplesToDataset`, `mergeNormalized`, `applyPatch`; `PatchService` clarified as a thin DI wrapper; `GraphRepository.incrementVersionInTxn` added.

---

## 1. Controllers

### 1.1 GraphStoreController

**File:** `src/graph-store/graph-store.controller.ts`

**Responsibility:** HTTP endpoint routing for all GSP methods. Parses requests, delegates to services, formats responses with appropriate headers and status codes. Includes catch-all `@All` handler that returns 405 + `Allow` for unsupported verbs (UR-HTTP-03).

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/graph/:iri` | Direct graph retrieval |
| GET | `/graph-store?graph=<iri>` | Indirect named graph retrieval |
| GET | `/graph-store?default` | Default graph retrieval |
| HEAD | `/graph/:iri` | HEAD for direct graph |
| HEAD | `/graph-store?graph=<iri>` | HEAD for indirect graph |
| PUT | `/graph/:iri` | Replace direct graph |
| PUT | `/graph-store?graph=<iri>` | Replace indirect graph |
| POST | `/graph/:iri` | Merge into existing direct graph |
| POST | `/graph-store` | POST to store (mint new graph) |
| DELETE | `/graph/:iri` | Delete direct graph |
| DELETE | `/graph-store?graph=<iri>` | Delete indirect graph |
| PATCH | `/graph/:iri` | Incremental update (direct) |
| PATCH | `/graph-store?graph=<iri>` | Incremental update (indirect) |
| OPTIONS | `/*` | Capability discovery |
| ALL (fallback) | `/graph/:iri` | 405 + Allow for unregistered verbs |
| ALL (fallback) | `/graph-store` | 405 + Allow for unregistered verbs |

**Dependencies:**
- `GraphStoreService`
- `GraphRoutingService`
- `ContentNegotiationService`

**Input Types:**

```typescript
interface GraphStoreQueryDto {
  graph?: string;  // Percent-encoded IRI
  default?: boolean;
}

interface GraphStoreBodyDto {
  data: string;  // RDF payload
  contentType: string;
}
```

**Output Types:**

```typescript
interface GraphStoreResponseDto {
  status: number;
  headers: Record<string, string>;
  body?: string | Stream;
}

interface ErrorResponseDto {
  status: number;
  error: string;
  message: string;
}
```

---

### 1.2 CapabilityController

**File:** `src/graph-store/capability.controller.ts`

**Responsibility:** OPTIONS response handling for capability discovery.

**Response Headers:**

```
Allow: GET, HEAD, PUT, POST, DELETE, PATCH, OPTIONS
Accept-Patch: application/sparql-update   (only when GSP_PATCH_ENABLED=true)
```

---

## 2. Services

### 2.1 GraphStoreService

**File:** `src/graph-store/services/graph-store.service.ts`

**Responsibility:** Core business logic for graph operations. All mutations run inside a `dataSource.transaction()` that holds the advisory lock and increments the version.

**Public Methods:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `getGraph` | `iri: string, accept: string, ifNoneMatch?: string` | `Promise<GraphResult>` | Retrieve graph with content negotiation and 304 support |
| `headGraph` | `iri: string, accept?: string` | `Promise<GraphMetadata>` | HEAD — throws NotFoundException if absent |
| `putGraph` | `iri: string, data: Buffer, contentType: string, pre?: Preconditions` | `Promise<PutResult>` | Replace graph |
| `postGraph` | `body: Buffer, contentType: string, targetIri?: string, parts?: MultipartPart[]` | `Promise<PostResult>` | Merge into graph or mint |
| `deleteGraph` | `iri: string, pre?: Preconditions` | `Promise<DeleteResult>` | Delete graph |
| `patchGraph` | `iri: string, body: string, contentType: string, ifMatch?: string` | `Promise<PatchResult>` | Incremental update |

**Type Definitions:**
```typescript
interface GraphResult {
  status: 200 | 304;
  body: string;
  contentType: string;
  etag: string;
  vary: 'Accept';
}

interface GraphMetadata {
  etag: string;
  contentType: string;
  // Note: throws NotFoundException on absent graph (does NOT return { exists: false })
}

interface Preconditions {
  ifMatch?: string;
  ifNoneMatch?: string;
}

interface PutResult {
  status: 201 | 200 | 204;
  etag?: string;
  location?: string;
}

interface PostResult {
  status: 201 | 200 | 204;
  etag?: string;
  location?: string;
}

interface DeleteResult {
  status: 200 | 202 | 204;
}

interface PatchResult {
  status: 200 | 204;
  etag: string;
}
```

**Dependencies:** `GraphRepository`, `TripleRepository`, `ConcurrencyService`, `RdfService`, `PatchService`, `ETagService`, `DataSource`

---

### 2.2 GraphRoutingService

**File:** `src/graph-store/services/graph-routing.service.ts`

**Responsibility:** Parse request URIs to determine target graph (direct vs indirect identification).

**Public Methods:**

| Method           | Parameters            | Returns            | Description                    |
| ---------------- | --------------------- | ------------------ | ------------------------------ |
| `resolveTarget`  | `request: Request`    | `GraphTarget`      | Resolve graph IRI from request |
| `isDefaultGraph` | `target: GraphTarget` | `boolean`          | Check if target is default     |
| `validateIri`    | `iri: string`         | `ValidationResult` | Validate IRI format            |

**Type Definitions:**

typescript

```typescript
interface GraphTarget {
  iri: string | null;  // null = default graph
  isDefault: boolean;
  isIndirect: boolean;
  rawIri?: string;  // Original percent-encoded if indirect
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  normalizedIri?: string;
}
```

**Rules:**

- Direct: `/graph/{iri}` path → `iri`is the graph IRI
- Indirect: `?graph={percent-encoded-iri}` → decode and use
- Indirect default: `?default` → null IRI, default graph
- Non-absolute IRI → 400 Bad Request

---

### 2.3 ContentNegotiationService

**File:** `src/graph-store/services/content-negotiation.service.ts`

**Responsibility:** Handle Accept and Content-Type headers for RDF format negotiation.

**Public Methods:**

|Method|Parameters|Returns|Description|
|---|---|---|---|
|`parseAccept`|`accept: string \| undefined`|`MediaType[]`|Parse Accept header|
|`getBestMatch`|`accept: MediaType[], supported: MediaType[]`|`MediaType \| null`|Find best format|
|`getDefaultFormat`|—|`MediaType`|Return trio fallback|
|`validateContentType`|`contentType: string`|`ValidationResult`|Validate RDF format|

**Supported Media Types:*

```typescript
const SUPPORTED_READ: MediaType[] = [
  'application/rdf+xml',
  'text/turtle',
  'application/n-triples',
  'application/ld+json',
  'application/trig',
  'application/n-quads',
];

const SUPPORTED_WRITE: MediaType[] = [...SUPPORTED_READ];
const MANDATORY_TRIO: MediaType[] = [
  'application/rdf+xml',
  'text/turtle',
  'application/n-triples',
];
```

**Type Definitions:**

```typescript
interface MediaType {
  type: string;
  subtype: string;
  params: Record<string, string>;
  quality: number;  // From Accept header q-value
  raw: string;  // Original header value
}
```

---

### 2.4 ConcurrencyService

**File:** `src/graph-store/services/concurrency.service.ts`

**Responsibility:** Transaction-scoped advisory lock management and ETag state comparison.

> **Amendment D-05:** API changed from `withAdvisoryLock(graphId, fn)` using a raw `pg.Pool` connection to `lock(manager, iri)` taking the TypeORM `EntityManager` from an open transaction. This ensures the advisory lock and all subsequent writes share a single DB connection and commit/roll back atomically.

**Public Methods:**

| Method            | Parameters                                              | Returns         | Description                                                                |
| ----------------- | ------------------------------------------------------- | --------------- | -------------------------------------------------------------------------- |
| `lock`            | `manager: EntityManager, iri: string`                   | `Promise<void>` | Acquire xact-scoped advisory lock on the transaction's connection          |
| `compareVersions` | `ifMatchEtag: string, graphId: string, version: number` | `boolean`       | Check graphId + revision (throws `InvalidEtagException` on malformed ETag) |
| `hashGraphId`     | `iri: string`                                           | `number`        | IRI → 48-bit positive integer for `pg_advisory_xact_lock`                  |

**Implementation:**
```typescript
// ConcurrencyService.lock — MUST be called inside an open dataSource.transaction() lambda
async lock(manager: EntityManager, iri: string): Promise<void> {
  await manager.query(
    'SELECT pg_advisory_xact_lock($1)',
    [this.hashGraphId(iri)]
  );
  // Lock is released when the transaction commits or rolls back.
}

hashGraphId(iri: string): number {
  const buf  = crypto.createHash('sha256').update(iri).digest();
  const high = buf.readUInt32BE(0);
  const low  = buf.readUInt16BE(4);
  return high * 0x10000 + low;   // 48-bit, no >>> 0 truncation
}
```

**Usage pattern:**
```typescript
return this.dataSource.transaction(async (manager) => {
  await this.concurrencyService.lock(manager, iri);
  // ... all reads and writes use `manager` on the same connection
});
```

---

### 2.5 ETagService

**File:** `src/graph-store/services/etag.service.ts`

**Responsibility:** Generate and parse composite ETags. Provide separate comparison methods for read and write preconditions.

> **Amendment D-06:** The original single `compare(etag, version)` method (rev-only) is replaced by two methods with distinct semantics. `compareStrong` is used for `If-None-Match` (reads); `compareState` is used for `If-Match` (writes). Rev-only comparison would allow a Turtle-cached ETag from a *different* graph at the same revision to falsely match.

**Public Methods:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `generate` | `graphId: string, version: number, mediaType: string` | `string` | Create ETag: `"{graphId}.{ver}.{encodedMediaType}"` |
| `parse` | `etag: string` | `ParsedEtag` | Extract components (throws `InvalidEtagException` on malformed) |
| `compareStrong` | `etag: string, graphId: string, version: number, mediaType: string` | `boolean` | Full ETag comparison — for `If-None-Match` → 304 |
| `compareState` | `etag: string, graphId: string, version: number` | `boolean` | State-only comparison — for `If-Match` → 412 |
| `extractFirstEtag` | `headerValue: string` | `string \| null` | Extract first strong ETag from header; `null` for weak (`W/`) or empty |

**Format:** `"{graphId}.{version}.{encodeURIComponent(mediaType)}"`

**Example:** `"a1b2c3d4.42.text%2Fturtle"`

**Type Definitions:**
```typescript
interface ParsedEtag {
  graphId: string;
  version: number;
  mediaType: string;   // decoded (no percent-encoding)
  raw: string;
}
```

---

### 2.6 RdfService

**File:** `src/rdf/rdf.service.ts`

**Responsibility:** RDF parsing, serialization, merge, and PATCH application using a multi-library routing approach.

**Library routing:**

| Media type | Parse | Serialize |
|-----------|-------|-----------|
| `text/turtle`, `application/trig`, `application/n-triples`, `application/n-quads` | N3.js | N3.js |
| `application/rdf+xml` | rdfxml-streaming-parser | in-house `RdfXmlSerializer` |
| `application/ld+json` | jsonld-streaming-parser | jsonld |

**Public Methods:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `parse` | `data: Buffer, contentType: string` | `Promise<DatasetCore>` | Parse to in-memory dataset (routes by media type) |
| `serialize` | `dataset: DatasetCore, mediaType: string` | `Promise<string>` | Serialize to string (triple formats; no graph label) |
| `serializeStream` | `dataset: DatasetCore, mediaType: string` | `Readable` | Streaming serialization |
| `serializeToDataset` | `dataset: DatasetCore, mediaType: string, graphIri: string \| null` | `Promise<string>` | Serialize with graph label for quad formats (UR-FMT-05) |
| `triplesToDataset` | `triples: NormalizedTriple[], graphIri: string \| null` | `DatasetCore` | Reconstruct DatasetCore from persisted rows |
| `merge` | `existing: DatasetCore, incoming: DatasetCore` | `DatasetCore` | RDF merge at DatasetCore level (standardizes bnodes apart) |
| `mergeNormalized` | `existing: NormalizedTriple[], incoming: NormalizedTriple[]` | `NormalizedTriple[]` | Row-level deduplicating union (bnodes already standardized by ingest) |
| `parseWithReconciliation` | `data: Buffer, contentType: string, targetIri: string \| null` | `Promise<NormalizedTriple[]>` | Parse + enforce single-graph scope + standardize blank nodes apart |
| `applyPatch` | `existing: NormalizedTriple[], parsed: SparqlUpdate, targetIri: string \| null` | `Promise<NormalizedTriple[]>` | Apply SPARQL Update AST to existing rows (`null` = default graph, GSP-010 v4) |

**Blank-node storage strategy:**
- Blank-node **objects** → `objectType: 'B'`, `object` column stores the genid label **without** `_:` prefix (e.g. `genid-550e8400`). Reconstructed by `triplesToDataset` as `DataFactory.blankNode(label)` → `termType === 'BlankNode'`.
- Blank-node **subjects** → `subjectType: 'B'`, `subject` column stores the genid label **without** `_:` prefix (same convention as objects). Reconstructed by `triplesToDataset` as `DataFactory.blankNode(label)`.
- RDF/XML serialization uses the in-house `RdfXmlSerializer`. If a graph cannot be represented in RDF/XML, serialization raises `RdfXmlSerializationException` rather than dropping data.

**Type Definitions:**
```typescript
import { DatasetCore } from '@rdfjs/types';
import { SparqlUpdate } from 'sparqljs';

interface NormalizedTriple {
  subject:    string;   // IRI (U) or genid label without '_:' (B)
  subjectType:'U' | 'B';
  predicate:  string;
  object:     string;   // IRI (U), literal (L), or genid label without '_:' (B)
  objectType: 'U' | 'L' | 'B';
  langTag?:   string;
  datatype?:  string;
}
```

---

### 2.7 PatchService

**File:** `src/graph-store/services/patch.service.ts`

**Responsibility:** SPARQL Update validation, scope enforcement, and application. **This is a thin DI wrapper that delegates to `RdfService`** (Amendment S-01). The class must be implemented so the NestJS module registration resolves; without it the application will fail to start with a DI resolution error.

**Public Methods:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `validate` | `patch: string` | `ValidationResult` | Validate SPARQL Update syntax (delegates to `sparqljs`) |
| `parse` | `patch: string` | `ParsedUpdate` | Parse into operations (delegates to `sparqljs`) |
| `scopeToGraph` | `operations: UpdateOperation[], targetIri: string \| null` | `ValidationResult` | Check graph scope — violation → 422 (`null` target additionally rejects any `GRAPH` clause) |
| `apply` | `existing: NormalizedTriple[], parsed: SparqlUpdate, targetIri: string \| null` | `Promise<NormalizedTriple[]>` | Apply patch (delegates to `RdfService.applyPatch`) |

**Type Definitions:**

```typescript
interface ParsedUpdate {
  operations: UpdateOperation[];
  prefixes: Record<string, string>;
}

interface UpdateOperation {
  type: 'insert' | 'delete' | 'load' | 'clear';
  graph?: string;
  // ... other operation-specific fields
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  operations?: UpdateOperation[];
}
```

**Dependencies:** `RdfService`

---

### 2.8 AuthService

**File:** `src/auth/auth.service.ts`

**Responsibility:** Pluggable authentication with configurable strategies.

**Public Methods:**

| Method         | Parameters                                             | Returns               | Description            |
| -------------- | ------------------------------------------------------ | --------------------- | ---------------------- |
| `authenticate` | `request: Request`                                     | `Promise<AuthResult>` | Authenticate request   |
| `addStrategy`  | `strategy: AuthStrategy`                               | `void`                | Register auth strategy |
| `authorize`    | `identity: Identity, resource: string, action: string` | `boolean`             | Check permissions      |

**Type Definitions:**

```typescript
interface AuthStrategy {
  name: string;
  authenticate(request: Request): Promise<AuthResult>;
  canHandle(request: Request): boolean;
}

interface AuthResult {
  authenticated: boolean;
  identity?: Identity;
  scheme: string;
}

interface Identity {
  id: string;
  roles: string[];
  claims: Record<string, any>;
}

interface AccessPolicy {
  can(identity: Identity, resource: string, action: string): boolean;
}
```

---

### 2.9 CapabilityService

**File:** `src/graph-store/services/capability.service.ts`

**Responsibility:** Build OPTIONS response with allowed methods and capabilities.

**Public Methods:**

| Method                 | Parameters         | Returns           | Description               |
| ---------------------- | ------------------ | ----------------- | ------------------------- |
| `getAllowedMethods`    | `resource: string` | `string[]`        | List allowed methods      |
| `getAcceptPatch`       | —                  | `string[]`        | List accepted patch types |
| `buildOptionsResponse` | `resource: string` | `OptionsResponse` | Build OPTIONS response    |

---

## 3. Repositories

### 3.1 GraphRepository

**File:** `src/graph-store/repositories/graph.repository.ts`

**Responsibility:** Graph CRUD and version management.

> **Amendment D-01:** `Graph.iri` is `string` (never `null`). The default graph uses the sentinel IRI `'urn:x-arq:DefaultGraph'`. `create(iri: string)` no longer accepts `null`. `findDefault()` does a simple lookup — the migration seeds the row, this method never auto-creates.

**Public Methods:**

| Method                  | Parameters                            | Returns                  | Description                                     |
| ----------------------- | ------------------------------------- | ------------------------ | ----------------------------------------------- |
| `findByIri`             | `iri: string`                         | `Promise<Graph \| null>` | Find graph by IRI                               |
| `findById`              | `id: string`                          | `Promise<Graph \| null>` | Find graph by ID                                |
| `findDefault`           | —                                     | `Promise<Graph>`         | Get default graph (throws if migration not run) |
| `create`                | `iri: string`                         | `Promise<Graph>`         | Create named graph (IRI always a real string)   |
| `delete`w               | `id: string`                          | `Promise<void>`          | Delete graph                                    |
| `exists`                | `iri: string`                         | `Promise<boolean>`       | Check existence                                 |
| `findByIriInTxn`        | `manager: EntityManager, iri: string` | `Promise<Graph \| null>` | Transaction-aware find                          |
| `createInTxn`           | `manager: EntityManager, iri: string` | `Promise<Graph>`         | Transaction-aware create                        |
| `deleteInTxn`           | `manager: EntityManager, id: string`  | `Promise<void>`          | Transaction-aware delete                        |
| `incrementVersionInTxn` | `manager: EntityManager, id: string`  | `Promise<number>`        | Increment version; returns new value            |

**Constant:**
```typescript
export const DEFAULT_GRAPH_IRI = 'urn:x-arq:DefaultGraph';
```

**Type Definitions:**
```typescript
interface Graph {
  id: string;
  iri: string;      // Always a string. Default graph uses DEFAULT_GRAPH_IRI sentinel.
  version: number;  // BIGINT in DB; coerced to number by entity transformer
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

---

### 3.2 TripleRepository

**File:** `src/graph-store/repositories/triple.repository.ts`

**Responsibility:** Triple CRUD and bulk operations.

**Public Methods:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `findByGraphId` | `graphId: string` | `Promise<NormalizedTriple[]>` | Get all triples |
| `findByGraphIdStream` | `graphId: string, batchSize?: number` | `Readable` | Stream triples (synchronous, cursor-based, bounded memory) |
| `insert` | `graphId: string, triples: NormalizedTriple[]` | `Promise<void>` | Bulk insert (`ON CONFLICT DO NOTHING` per unique index) |
| `deleteByGraphId` | `graphId: string` | `Promise<number>` | Delete all triples; returns count |
| `countByGraphId` | `graphId: string` | `Promise<number>` | Count triples |
| `insertInTxn` | `manager: EntityManager, graphId: string, triples: NormalizedTriple[]` | `Promise<void>` | Transaction-aware insert |
| `deleteByGraphIdInTxn` | `manager: EntityManager, graphId: string` | `Promise<number>` | Transaction-aware delete |

> [!NOTE]
> **`findByGraphIdStream` returns `Readable` synchronously** (not `Promise<Readable>`). Uses cursor-based paged SELECT to keep memory bounded for large graphs (NFR-04).

> [!NOTE]
> **`insert` uses `ON CONFLICT DO NOTHING`** against the `idx_triples_unique` composite unique index, providing DB-level deduplication as a safety net.

---

## 4. Guards

### 4.1 JwtAuthGuard

**File:** `src/auth/guards/jwt-auth.guard.ts`

**Responsibility:** Validate JWT bearer tokens.

**Implementation:** Extends NestJS `CanActivate`, uses `@nestjs/jwt` for validation.

---

### 4.2 ApiKeyGuard

**File:** `src/auth/guards/api-key.guard.ts`

**Responsibility:** Validate API Key from `X-API-Key` header.

**Header:** `X-API-Key: <configured-key>`

---

## 5. Interceptors

### 5.1 TracingInterceptor

**File:**`src/common/interceptors/tracing.interceptor.ts`

**Responsibility:** Create OpenTelemetry spans for requests.

**Attributes:**

- `http.method`
- `http.url`
- `gsp.graph.iri`
- `gsp.operation`

---

### 5.2 LoggingInterceptor

**File:**`src/common/interceptors/logging.interceptor.ts`

**Responsibility:** Structured request/response logging.

**Log Fields:**

```typescript
{
  method: string;
  path: string;
  graphIri: string | null;
  contentType: string;
  outcome: number;
  duration_ms: number;
  traceId: string;
}
```
### 5.3 ETagInterceptor

**File:** `src/common/interceptors/etag.interceptor.ts`

**Responsibility:** Inject `ETag` header and set `Vary: Accept` on successful GET/HEAD responses. `Vary: Accept` is only set for GET/HEAD (negotiated responses), not for PUT/POST/DELETE/PATCH.

---

## 6. Exception Filters

### 6.1 GspExceptionFilter

**File:** `src/common/filters/gsp-exception.filter.ts`

**Mappings:**

| Exception                            | Status Code                                         |
| ------------------------------------ | --------------------------------------------------- |
| `ParseException`                     | 400                                                 |
| `InvalidIriException`                | 400                                                 |
| `DatasetMismatchException`           | 400                                                 |
| `UnauthorizedException`              | 401                                                 |
| `ForbiddenException`                 | 403                                                 |
| `GraphNotFoundException`             | 404                                                 |
| `MethodNotAllowedException`          | 405 (with `Allow` header)                           |
| `NotAcceptableException`             | 406                                                 |
| `ConflictException`                  | 409                                                 |
| `PreconditionFailedException`        | 412                                                 |
| `PatchUnsupportedMediaTypeException` | 415 (with `Accept-Patch` header)                    |
| `UnsupportedMediaTypeException`      | 415                                                 |
| `UnprocessableEntityException`       | 422                                                 |
| `PreconditionRequiredException`      | 428                                                 |
| `InvalidEtagException`               | 400 (malformed ETag treated as absent precondition) |

---

## 7. Module Structure

```typescript
// app.module.ts
@Module({
  imports: [
    DatabaseModule,
    RdfModule,
    AuthModule,
    GraphStoreModule,
  ],
})
export class AppModule {}

// graph-store.module.ts
@Module({
  controllers: [
    GraphStoreController,
    CapabilityController,
  ],
  providers: [
    GraphStoreService,
    GraphRoutingService,
    ContentNegotiationService,
    ConcurrencyService,
    ETagService,
    PatchService,       // thin DI wrapper over RdfService — MUST be implemented
    CapabilityService,
    GraphRepository,
    TripleRepository,
  ],
  exports: [GraphStoreService],
})
export class GraphStoreModule {}

// rdf.module.ts
@Module({
  providers: [RdfService],
  exports: [RdfService],
})
export class RdfModule {}

// auth.module.ts
@Module({
  providers: [
    AuthService,
    JwtAuthGuard,
    ApiKeyGuard,
    OptionalAuthGuard,
    JwtStrategy,
    ...authProviders,
  ],
  exports: [AuthService, ...authGuards],
})
export class AuthModule {}
```

---

*Component definitions amended per pre-construction review. See `GSP-ApplicationDesign-Review.md`.*
