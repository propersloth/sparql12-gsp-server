# Service Definitions

#normative #inception #design 

## SPARQL 1.2 Graph Store Protocol Server

| Field | Value |
|-------|-------|
| **Document type** | AIDLC Application Design — Service Definitions |
| **Status** | Amended |
| **Technology Stack** | NestJS + TypeScript + PostgreSQL |

> **Amendment log.** Three corrections: (D-03) `patchGraph` behavior order corrected — existence checked before `If-Match`; (D-05) `ConcurrencyService.withAdvisoryLock` replaced by `lock(manager, iri)` taking a transaction `EntityManager`; (D-06) `ETagService.compare` replaced by `compareStrong` / `compareState`. Behavior sections for `putGraph` and `deleteGraph` updated to use the transaction lock pattern. New `RdfService` methods added (`triplesToDataset`, `mergeNormalized`, `applyPatch`). `PatchService` documented as thin DI wrapper.

---

## 1. GraphStoreService

**File:** `src/graph-store/services/graph-store.service.ts`

**Purpose:** Core business logic for all GSP operations. All mutations run inside a `dataSource.transaction()` that holds the advisory lock and performs the version increment atomically.

### 1.1 Method: `getGraph`

```typescript
async getGraph(
  iri: string,
  accept: string | undefined,
  ifNoneMatch?: string
): Promise<GraphResult>
```

**Returns:** `GraphResult`

```typescript
interface GraphResult {
  status: 200 | 304;
  body: string;
  contentType: string;
  etag: string;
  vary: 'Accept';
}
```

**Errors:**
- `GraphNotFoundException` → 404 (named graphs with 0 triples; empty named graphs do not exist)
- `NotAcceptableException` → 406

**Behavior:**
1. `GraphRepository.findByIri()` (or `findDefault()` for `?default`)
2. If not found and named graph → 404
3. If not found and default graph → 200 with empty body
4. Negotiate best format via `ContentNegotiationService`
5. Generate ETag via `ETagService.generate(graph.id, graph.version, mediaType)`
6. If `If-None-Match` present: call `ETagService.compareStrong(ifNoneMatch, graph.id, graph.version, mediaType)` → 304 if match (full ETag including format — Amendment D-06)
7. Load triples: `TripleRepository.findByGraphId()`
8. Reconstruct dataset: `RdfService.triplesToDataset(triples, graph.iri)`
9. Serialize: `RdfService.serialize(dataset, mediaType)` for triple formats; `RdfService.serializeToDataset(dataset, mediaType, graph.iri)` for quad formats (TriG/N-Quads/JSON-LD)
10. Return 200 with `ETag` and `Vary: Accept`

---

### 1.2 Method: `headGraph`

```typescript
async headGraph(
  iri: string,
  accept?: string
): Promise<GraphMetadata>
```

**Returns:** `GraphMetadata`

```typescript
interface GraphMetadata {
  etag: string;
  contentType: string;
  // Does NOT return { exists: false } — throws NotFoundException on absent graph
}
```

**Errors:**
- `GraphNotFoundException` → 404 (throws, does not return sentinel)

**Behavior:**
1. `GraphRepository.findByIri()`
2. If not found → throw `GraphNotFoundException` (404)
3. Negotiate format
4. Generate ETag via `ETagService.generate(graph.id, graph.version, mediaType)`
5. Return headers only (no body)

---

### 1.3 Method: `putGraph`

```typescript
async putGraph(
  iri: string,
  data: Buffer,
  contentType: string,
  pre?: Preconditions
): Promise<PutResult>
```

**Returns:** `PutResult`

```typescript
interface Preconditions {
  ifMatch?: string;
  ifNoneMatch?: string;  // '*' enables create-only PUT
}

interface PutResult {
  status: 201 | 200 | 204;
  etag?: string;
  location?: string;
}
```

**Errors:**
- `ParseException` → 400
- `InvalidIriException` → 400
- `DatasetMismatchException` → 400
- `UnsupportedMediaTypeException` → 415
- `PreconditionFailedException` → 412

**Behavior:**
1. Validate content type
2. Parse + reconcile payload: `RdfService.parseWithReconciliation(data, contentType, iri)` → `NormalizedTriple[]`
3. Inside `dataSource.transaction()`:
   a. `ConcurrencyService.lock(manager, iri)`
   b. `GraphRepository.findByIriInTxn(manager, iri)`
   c. If `pre.ifNoneMatch === '*'` and graph exists → 412
   d. If `pre.ifMatch` present → `ETagService.compareState(ifMatch, graph.id, graph.version)` → 412 if no match
   e. If parsed result is empty → delete any existing triples, return 204 (graph becomes absent)
   f. If graph doesn't exist → `GraphRepository.createInTxn(manager, iri)` (→ 201 on return)
   g. `TripleRepository.deleteByGraphIdInTxn(manager, graphId)`
   h. `TripleRepository.insertInTxn(manager, graphId, triples)` (`ON CONFLICT DO NOTHING`)
   i. `GraphRepository.incrementVersionInTxn(manager, graphId)` → new version
4. Return 201 (new) or 200/204 (existing)

---

### 1.4 Method: `postGraph`

```typescript
async postGraph(
  body: Buffer,
  contentType: string,
  targetIri?: string,
  parts?: MultipartPart[]
): Promise<PostResult>
```

**Returns:** `PostResult`

```typescript
interface PostResult {
  status: 201 | 200 | 204;
  etag?: string;
  location?: string;
}
```

**Errors:**
- `ParseException` → 400
- `DatasetMismatchException` → 400
- `BadRequestException` → 400 (non-absolute `targetIri`)
- `GraphNotFoundException` → 404 (POST to absent named-graph IRI never creates; use PUT to name or POST-to-store to mint)
- `UnsupportedMediaTypeException` → 415

**Behavior — targeted POST (existing graph):**
1. Validate content type
2. Parse + reconcile: `RdfService.parseWithReconciliation(body, contentType, targetIri)`
3. Validate `targetIri` is absolute → 400 if not
4. Inside `dataSource.transaction()`:
   a. `ConcurrencyService.lock(manager, targetIri)`
   b. Graph MUST exist → 404 if absent (POST never creates at a caller-chosen IRI)
   c. Load existing: `TripleRepository.findByGraphId(graphId)`
   d. Merge: `RdfService.mergeNormalized(existing, incoming)`
   e. `TripleRepository.deleteByGraphIdInTxn(manager, graphId)`
   f. `TripleRepository.insertInTxn(manager, graphId, merged)`
   g. `GraphRepository.incrementVersionInTxn(manager, graphId)`
5. Return 200/204 with new ETag

**Behavior — POST to store (mint):**
1. Parse + reconcile
2. Mint IRI: `{GSP_BASE_URL}/graphs/{uuid}`
3. Inside transaction: create graph row, insert triples, increment version
4. Return 201 + `Location: {mintedIri}`

**Behavior — multipart:**
- Parse each part by its declared type (or infer from extension)
- Union all parts via `mergeNormalized` before the single write

---

### 1.5 Method: `deleteGraph`

```typescript
async deleteGraph(
  iri: string,
  pre?: Preconditions
): Promise<DeleteResult>
```

**Returns:** `DeleteResult`

```typescript
interface DeleteResult {
  status: 200 | 202 | 204;
}
```

**Errors:**
- `GraphNotFoundException` → 404
- `PreconditionFailedException` → 412
- `ForbiddenException` → 403

**Behavior:**
1. Inside `dataSource.transaction()`:
   a. `ConcurrencyService.lock(manager, iri)`
   b. Graph MUST exist → 404 if absent
   c. If `pre.ifMatch` present → `ETagService.compareState(ifMatch, graph.id, graph.version)` → 412 if no match
   d. `TripleRepository.deleteByGraphIdInTxn(manager, graphId)`
   e. `GraphRepository.deleteInTxn(manager, graphId)` (if not default graph)
2. Return 200/202/204

---

### 1.6 Method: `patchGraph`

```typescript
async patchGraph(
  iri: string,
  body: string,
  contentType: string,
  ifMatch?: string
): Promise<PatchResult>
```

**Returns:** `PatchResult`

```typescript
interface PatchResult {
  status: 200 | 204;
  etag: string;
}
```

**Errors:**
- `GraphNotFoundException` → 404 (**checked first — Amendment D-03**)
- `PreconditionRequiredException` → 428
- `PatchUnsupportedMediaTypeException` → 415 (with `Accept-Patch` header)
- `PreconditionFailedException` → 412
- `ParseException` → 400
- `UnprocessableEntityException` → 422 (multi-graph scope or unsupported WHERE pattern)
- `ConflictException` → 409

**Behavior (Amendment D-03 — corrected order):**
1. **Existence check FIRST:** `GraphRepository.findByIri(iri)` → 404 if absent (OQ-14: 404 precedes 428)
2. **`If-Match` present check:** → 428 if absent (PATCH requires precondition per UR-CC-04)
3. **Content-Type check:** must be `application/sparql-update` → 415 + `Accept-Patch` if not
4. **SPARQL parse:** `PatchService.parse(body)` → 400 if invalid syntax
5. **Scope check:** `PatchService.scopeToGraph(operations, iri)` → 422 if multi-graph
6. Inside `dataSource.transaction()`:
   a. `ConcurrencyService.lock(manager, iri)`
   b. Re-read graph inside lock
   c. `ETagService.compareState(ifMatch, graph.id, graph.version)` → 412 if stale
   d. Load existing: `TripleRepository.findByGraphId(graphId)`
   e. Apply: `PatchService.apply(existing, parsed, iri)` (delegates to `RdfService.applyPatch`)
   f. `TripleRepository.deleteByGraphIdInTxn(manager, graphId)`
   g. `TripleRepository.insertInTxn(manager, graphId, updated)`
   h. `GraphRepository.incrementVersionInTxn(manager, graphId)`
7. Return 200/204 with new ETag

---

## 2. GraphRoutingService

**File:** `src/graph-store/services/graph-routing.service.ts`

**Purpose:** Parse HTTP requests to determine target graph via direct or indirect identification.

### 2.1 Method: `resolveTarget`

```typescript
resolveTarget(request: Request): GraphTarget
```

|Parameter|Type|Description|
|---|---|---|
|`request`|`Request`|Express/NestJS request object|

**Returns:** `GraphTarget`

```typescript
interface GraphTarget {
  iri: string | null;
  isDefault: boolean;
  isIndirect: boolean;
  rawIri?: string;
}
```

**Routing Rules:**

| Pattern                         | Result                         |
| ------------------------------- | ------------------------------ |
| Path `/graph/{iri+}`            | Direct: `iri`= decoded path    |
| Query `?graph={iri}`            | Indirect: `iri`= decoded param |
| Query `?default`                | Default graph: `iri = null`    |
| Path `/graph-store` + no params | Store URL (for POST-to-store)  |

**Validation:**

- Non-absolute IRI → throw `InvalidIriException`
- Unhostable IRI → handled by caller (404/403)

---

### 2.2 Method: `validateIri`

```typescript
validateIri(iri: string): ValidationResult
```

|Parameter|Type|Description|
|---|---|---|
|`iri`|`string`|IRI to validate|

**Returns:** `ValidationResult`

```typescript
interface ValidationResult {
  valid: boolean;
  error?: string;
  normalizedIri?: string;
}
```

**Validation Checks:**

1.Non-empty

2.Absolute IRI (starts with scheme)

3.Valid percent-encoding (decode and re-encode)

4.No invalid characters per RFC 3987

---

## 3. ContentNegotiationService

**:** `src/graph-store/services/content-negotiation.service.ts`

**Purpose:** Handle Accept and Content-Type headers for format negotiation.

### 3.1 Method: `parseAccept`

```typescript
parseAccept(accept: string | undefined): MediaType[]
```

|Parameter|Type|Description|
|---|---|---|
|`accept`|`string \| undefined`|Accept header value|

**Returns:** `MediaType[]` sorted by quality descending

**Example:**

```
Accept: text/turtle; q=0.9, application/ld+json; q=0.8
→ [turtle, json-ld]
```

---

### 3.2 Method: `getBestMatch`

```typescript
getBestMatch(
  accept: MediaType[],
  supported: MediaType[]
): MediaType | null
```

**Returns:** Best matching supported media type, or `null` (→ 406)

---

### 3.3 Method: getDefaultFormat

```typescript
getDefaultFormat(): MediaType
```

**Returns:** First format from mandatory trio (Turtle preferred)

---

### 3.4 Method: `validateContentType`

```typescript
validateContentType(contentType: string): ValidationResult
```

**Returns:** Valid if supported RDF format, error if not

---

## 4. ConcurrencyService

**File:** `src/graph-store/services/concurrency.service.ts`

**Purpose:** Transaction-scoped advisory locking and ETag state comparison for atomic operations.

### 4.1 Method: `lock`

```typescript
async lock(manager: EntityManager, iri: string): Promise<void>
```

> **Amendment D-05:** Replaces `withAdvisoryLock(graphId, fn)`. Accepts the TypeORM `EntityManager` from an open transaction so the lock, reads, writes, and version increment all share one DB connection.

| Parameter | Type | Description |
|-----------|------|-------------|
| `manager` | `EntityManager` | The transaction's entity manager |
| `iri` | `string` | Graph IRI (hashed to a bigint lock key) |

**Implementation:**

```typescript
async lock(manager: EntityManager, iri: string): Promise<void> {
  await manager.query(
    'SELECT pg_advisory_xact_lock($1)',
    [this.hashGraphId(iri)]
  );
}
```

---

### 4.2 Method: `compareVersions`

```typescript
compareVersions(
  ifMatchEtag: string,
  currentGraphId: string,
  currentVersion: number
): boolean
```

**Returns:** `true` iff both the graphId **and** the version component match.

> Checks graphId to prevent a cross-graph false match (different graph, same revision number would otherwise pass).

---

### 4.3 Method: `hashGraphId`

```typescript
hashGraphId(iri: string): number
```

**Returns:** 48-bit positive integer (no `>>> 0` truncation) for `pg_advisory_xact_lock`.

---

## 5. ETagService

**File:** `src/graph-store/services/etag.service.ts`

**Purpose:** Generate and parse composite ETags. Two comparison methods with distinct semantics for read vs write preconditions.

### 5.1 Method: `generate`

```typescript
generate(graphId: string, version: number, mediaType: string): string
```

**Returns:** `"{graphId}.{version}.{encodeURIComponent(mediaType)}"`

**Example:** `"a1b2c3d4.42.text%2Fturtle"`

---

### 5.2 Method: `parse`

```typescript
parse(etag: string): ParsedEtag
```

**Returns:**
```typescript
interface ParsedEtag {
  graphId: string;
  version: number;
  mediaType: string;  // decoded (no percent-encoding)
  raw: string;
}
```

---

### 5.3 Method: `compareStrong`

```typescript
compareStrong(
  etag: string,
  graphId: string,
  version: number,
  mediaType: string
): boolean
```

**Purpose:** Full ETag comparison — for `If-None-Match` / 304 (Amendment D-06).

**Returns:** `true` iff graphId, version, **and** mediaType all match.

**Use case:** A client that cached the Turtle representation must NOT receive a 304 when requesting JSON-LD at the same revision — the mediaType component differs.

---

### 5.4 Method: `compareState`

```typescript
compareState(
  etag: string,
  graphId: string,
  version: number
): boolean
```

**Purpose:** State-only comparison — for `If-Match` / 412 (Amendment D-06).

**Returns:** `true` iff graphId **and** version match (mediaType irrelevant).

**Use case:** A client that read the graph as Turtle may safely precondition a PATCH or PUT regardless of which format it used to read.

---

### 5.5 Method: `extractFirstEtag`

```typescript
extractFirstEtag(headerValue: string): string | null
```

**Returns:** First strong ETag from header, `'*'` for wildcard, `null` for empty or weak (`W/`) ETags.

---

## 6. RdfService

**File:** `src/rdf/rdf.service.ts`

**Purpose:** Multi-library RDF parsing, serialization, merge, and PATCH application.

### 6.1 Method: `parse`

*(routes internally to N3.js / rdfxml-streaming-parser / jsonld-streaming-parser)*

```typescript
async parse(
  data: Buffer | Stream,
  contentType: string
): Promise<DatasetCore>
```

|Parameter|Type|Description|
|---|---|---|
|`data`|`Buffer \| Stream`|RDF input|
|`contentType`|`string`|Format of input|

**Returns:** N3.js DatasetCore

**Supported Formats:**

- `application/rdf+xml`
- `text/turtle`
- `application/n-triples`
- `application/ld+json`
- `application/trig`
- `application/n-quads`

### 6.2 Method: `serialize`

```typescript
async serialize(dataset: DatasetCore, mediaType: string): Promise<string>
```

**Use for:** triple formats (Turtle, N-Triples, RDF/XML). No graph label applied.

---

### 6.3 Method: `serializeToDataset`

```typescript
async serializeToDataset(
  dataset: DatasetCore,
  mediaType: string,
  graphIri: string | null
): Promise<string>
```

**Use for:** quad formats (TriG, N-Quads, JSON-LD). Applies `graphIri` as the named-graph label per UR-FMT-05. Pass `null` for the default graph.

---
### 6.4 Method: `merge`

```typescript
merge(
  existing: DatasetCore,
  incoming: DatasetCore
): DatasetCore
```

**Returns:** RDF merge of two datasets

**Behavior:**

1.Create blank node mapper

2.Rename incoming blank nodes with fresh identifiers

3.Return union of datasets

---

### 6.5 Method: `triplesToDataset`

```typescript
triplesToDataset(triples: NormalizedTriple[], graphIri: string | null): DatasetCore
```

**Purpose:** Reconstruct an in-memory `DatasetCore` from persisted `NormalizedTriple[]` rows. Needed by `getGraph` before serialization.

**Type B handling:** `objectType: 'B'` → `DataFactory.blankNode(t.object)` (label stored without `_:` prefix) → `termType === 'BlankNode'` preserved through the round-trip so `countDistinctBlankNodes` returns non-zero values (gate G5).

---

### 6.6 Method: `merge`

```typescript
merge(existing: DatasetCore, incoming: DatasetCore): DatasetCore
```

**Behavior:** Standardizes incoming blank nodes apart then unions. Uses fresh `genid-{uuid}` labels for all incoming blank nodes so they cannot be identified with existing ones.

---

### 6.7 Method: `mergeNormalized`

```typescript
mergeNormalized(
  existing: NormalizedTriple[],
  incoming: NormalizedTriple[]
): NormalizedTriple[]
```

**Purpose:** Row-level deduplicating set-union. Used by `postGraph`. Blank nodes are already standardized apart by `parseWithReconciliation`'s skolemization, so this is a pure union with key-based deduplication.

---

### 6.8 Method: `parseWithReconciliation`

```typescript
async parseWithReconciliation(
  data: Buffer,
  contentType: string,
  targetGraphIri: string | null
): Promise<NormalizedTriple[]>
```

**Purpose:** Parse, enforce single-graph scope (UR-FMT-04), and skolemize blank nodes.

**Validation (Amendment D-04 — corrected):**
- Default-graph triples → **always accepted**, mapped to the target (named or default). *Not rejected.*
- Named graph matching `targetGraphIri` → accepted.
- Named graph whose IRI differs from `targetGraphIri`, or any named graph when target is the default graph → throws `DatasetMismatchException` (→ 400).

---

### 6.9 Method: `applyPatch`

```typescript
async applyPatch(
  existing: NormalizedTriple[],
  parsed: SparqlUpdate,
  targetIri: string
): Promise<NormalizedTriple[]>
```

**Purpose:** Apply a pre-parsed SPARQL Update AST to existing rows.

**v1 scope:** `INSERT DATA` / `DELETE DATA` and trivial `WHERE {}` / `WHERE { ?s ?p ?o }`. Complex WHERE patterns throw `UnprocessableEntityException`.

---

## 7. PatchService

**File:** `src/graph-store/services/patch.service.ts`

**Purpose:** Thin DI wrapper over `RdfService` providing named SPARQL Update operations. **This class MUST be implemented** — it is registered in `GraphStoreModule` providers, and NestJS will fail at startup if the class does not exist.

### 7.1 Method: `validate`

```typescript
validate(patch: string): ValidationResult
```

**Behavior:** Delegates to `sparqljs` parser; returns `{ valid: false, error }` on syntax error.

---

### 7.2 Method: `parse`

```typescript
parse(patch: string): ParsedUpdate
```

**Behavior:** Delegates to `sparqljs`; returns parsed AST.

---

### 7.3 Method: `scopeToGraph`

```typescript
scopeToGraph(
  operations: UpdateOperation[],
  targetIri: string
): ValidationResult
```

**Behavior:** Inspects parsed AST for references to any graph other than `targetIri`. Multi-graph → `{ valid: false }` (→ 422).

---

### 7.4 Method: `apply`

```typescript
async apply(
  existing: NormalizedTriple[],
  parsed: SparqlUpdate,
  targetIri: string
): Promise<NormalizedTriple[]>
```

**Behavior:** Delegates to `RdfService.applyPatch(existing, parsed, targetIri)`.

---

## 8. AuthService

**File:** `src/auth/auth.service.ts`

**Purpose:** Pluggable authentication with configurable strategies.

### 8.1 Method: `authenticate`

```typescript
async authenticate(
  request: Request
): Promise<AuthResult>
```

**Returns:** Authentication result with identity

```typescript
interface AuthResult {
  authenticated: boolean;
  identity?: Identity;
  scheme: string;
}
```

**Behavior:**

1.Iterate registered strategies

2.First matching strategy authenticates

3.Return result

---

### 8.2 Method: `addStrategy`

```typescript
addStrategy(strategy: AuthStrategy): void
```

**Purpose:** Register authentication strategy at startup

---

### 8.3 Method: `authorize`

```typescript
authorize(
  identity: Identity,
  resource: string,
  action: string
): boolean
```

**Returns:** `true` if identity can perform action on resource

---

## 9. CapabilityService

**File:** `src/graph-store/services/capability.service.ts`

**Purpose:** Build OPTIONS responses for capability discovery.

### 9.1 Method: `getAllowedMethods`

```typescript
getAllowedMethods(resource: string): string[]
```

**Returns:** Array of allowed HTTP methods

---

### 9.2 Method: `getAcceptPatch`

```typescript
getAcceptPatch(): string[]
```

**Returns:** `['application/sparql-update']`

---

### 9.3 Method: `buildOptionsResponse`

```typescript
buildOptionsResponse(resource: string): OptionsResponse
```

**Returns:** Complete OPTIONS response

```typescript
interface OptionsResponse {
  status: 200;
  headers: {
    Allow: string;
    'Accept-Patch': string;
    'Content-Length': string;
  };
}
```

---

*Service definitions amended per pre-construction review. See `GSP-ApplicationDesign-Review.md`.*
