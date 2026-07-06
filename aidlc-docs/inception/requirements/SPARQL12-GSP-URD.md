# User Requirement Document — SPARQL 1.2 Graph Store Protocol Server

#normative #requirements #source

|                       |                                                                            |
| --------------------- | -------------------------------------------------------------------------- |
| **Document type**     | User Requirement Document — input to an AIDLC Inception phase               |
| **Status**            | Draft for inception intake                                                 |
| **Conformance source**| SPARQL 1.2 Graph Store Protocol — W3C Working Draft, 19 December 2024       |
| **Platform**          | Implementation-agnostic (see [CON-01](#5-constraints))                      |
| **Companion docs**    | `GSP-Test-Matrix.md` · `GSP-Spec-Ambiguities-and-Followup.md`              |

---

## Contents

0. [How to read this document](#0-how-to-read-this-document)
1. [Purpose and vision](#1-purpose-and-vision)
2. [Scope](#2-scope)
3. [Actors](#3-actors)
4. [Assumptions and dependencies](#4-assumptions-and-dependencies)
5. [Constraints](#5-constraints)
6. [Normative source register](#6-normative-source-register-traceability-backbone)
7. [Epics](#7-epics)
8. [Functional user requirements](#8-functional-user-requirements)
9. [Non-functional requirements](#9-non-functional-requirements)
10. [Acceptance criteria (phase exit)](#10-acceptance-criteria-phase-exit)
11. [Open questions for inception](#11-open-questions-for-inception)
12. [Risks](#12-risks)
13. [Traceability summary](#13-traceability-summary)
14. [Appendix A. Source-clause traceability matrix](#appendix-a-source-clause-traceability-matrix)

---

## 0. How to read this document

This URD expresses *what the user and stakeholders need* of a Graph Store Protocol (GSP) server, traced back to the **direct** normative clauses of the GSP specification and the **transitive** normative obligations it inherits by reference (WEBARCH, the URI/IRI RFCs, HTTP, SPARQL Update, and the RDF data-model specs).

It is written to be consumed by an AIDLC **inception** phase: every requirement is atomic, testable, and carries a traceability tag. Design is deliberately excluded, and the requirements are implementation-agnostic ([CON-01](#5-constraints)). Ambiguities are surfaced as Open Questions rather than resolved silently, because the GSP draft's own conformance section is incomplete (see [ASM-01](#4-assumptions-and-dependencies) / [RISK-01](#12-risks)).

> [!NOTE]
> **Identifier scheme.** Functional requirements `UR-`, non-functional `NFR-`, constraints `CON-`, assumptions `ASM-`, open questions `OQ-`, risks `RISK-`. Each requirement ends with an italic *Trace* line linking it to the [source register](#6-normative-source-register-traceability-backbone). RFC 2119 / 8174 keywords (**MUST**, **SHOULD**, **MAY**) are normative only in upper case.

---

## 1. Purpose and vision

Provide an HTTP service that lets clients **create, retrieve, replace, merge into, and delete RDF graphs** in a managed Graph Store using ordinary HTTP verbs, conforming to the SPARQL 1.2 Graph Store Protocol. The service is the lightweight, REST-style alternative to the full SPARQL 1.2 Protocol for clients that only need graph-granularity management.

The earlier feasibility analysis established that a static-file server can move opaque bytes but **cannot** satisfy the RDF-semantic obligations of the spec — chiefly the `POST` = *RDF merge* operation, parse-and-validate behaviour, and serialization-level content negotiation. Meeting those obligations requires an RDF-aware application server that hosts a parser / serializer / store in-process; the choice of server technology, language, and runtime is left open ([CON-01](#5-constraints)). This URD therefore treats those previously-infeasible obligations as **in-scope, first-class requirements**, independent of implementation.

---

## 2. Scope

### 2.1 In scope

- Graph management over HTTP for **the default graph and named graphs**.
- Both **Direct Graph Identification** (request URI *is* the graph) and **Indirect Graph Identification** (`?graph=<iri>` / `?default` against a Graph Store URL).
- Core methods `GET`, `HEAD`, `PUT`, `POST`, `DELETE`.
- Method `PATCH` — optional but supported — for incremental, SPARQL-Update-based modification ([Epic E10](#e10--incremental-update-patch)).
- `OPTIONS` as a first-class method, for method (`Allow`) and patch-format (`Accept-Patch`) discovery ([UR-HTTP-05](#8-functional-user-requirements)).
- RDF parsing, RDF merge, and serialization across the **mandatory trio** (RDF/XML, Turtle, N-Triples)[^trio] **plus** JSON-LD, TriG, and N-Quads, with defined single-graph / dataset rules ([Epic E9](#e9--serialization--media-type-coverage)).
- HTTP status-code semantics, content negotiation, conditional-request / caching behaviour, and **mandatory optimistic concurrency control** (strong ETags + conditional PATCH) per [Epic E11](#e11--concurrency-control--validators).

### 2.2 Out of scope (this iteration)

- SPARQL Query / SPARQL Update protocol endpoints (separate spec).
- Multi-tenant authn/authz beyond the hooks required to emit `401` / `403`.
- Federation, entailment regimes, service description, reasoning.
- Persistence-engine selection guarantees — an inception/architecture concern, captured only as NFRs.

---

## 3. Actors

| Actor | Description | Primary goals |
| :--- | :--- | :--- |
| **Graph Client** (API consumer) | Any HTTP/1.1 agent (app, script, library) | Manage graph content predictably via standard verbs |
| **Data Steward** | Human/service owning graph content | Trust that PUT replaces and POST merges exactly as specified |
| **Cache / Intermediary** | Proxy or browser cache | Honour cache metadata; revalidate correctly |
| **Operator** | Runs / monitors the service | Stable status codes, observability, safe failure modes |
| **Security / Access Policy** | Authn/authz layer | Reject unauthorized graph mutations |

---

## 4. Assumptions and dependencies

- **ASM-01 — Conformance target.** The GSP draft's §7 Conformance is effectively empty ("TODO"); there is no crisply-defined conformance class. The target is to *honour every direct MUST/MUST NOT, and every SHOULD unless explicitly waived, across all five core methods.* Each "a request that uses METHOD MUST…" clause is read as conditional on supporting that method; §3's "MUST accept HTTP requests… and handle them as specified" is read as requiring broad method coverage. **Confirmed ([OQ-01](#11-open-questions-for-inception)): all five core verbs (`GET`/`HEAD`/`PUT`/`POST`/`DELETE`) MUST ship; no core method may be omitted; all SHOULDs are honoured or carry a logged waiver. `PATCH` remains optional, but its RFC 5789 / 6585 MUSTs bind when present.**
- **ASM-02 — RDF toolchain availability.** The implementation can host an RDF parsing / serialization / merge library in-process. All RDF-semantic requirements depend on this capability, independent of the server technology chosen.
- **ASM-03 — HTTP baseline.** The spec cites RFC 2616; the implementation follows current HTTP semantics (RFC 9110) where 2616 is obsolete, which is compatible with the spec's intent.
- **ASM-04 — Empty-graph semantics.** **Decided ([OQ-04](#11-open-questions-for-inception)): empty _named_ graphs are not first-class — a named graph exists iff it holds ≥ 1 triple.** A `PUT`/`PATCH` that leaves a named graph empty renders it absent ([UR-PUT-04](#8-functional-user-requirements)); `GET`/`HEAD`/`DELETE` on a zero-triple named graph return `404`. **The default graph is exempt ([OQ-13](#11-open-questions-for-inception)): it always exists and returns `200` even when empty.** This is a conformant choice — GSP §5.3 makes empty-graph creation optional ("for implementations that support empty graphs").
- **DEP-01 — Media types.** Mandatory trio (spec floor for the no-`Accept` fallback): `application/rdf+xml`, `text/turtle`, `application/n-triples`. Additionally required (promoted from former OQ-02, see [UR-FMT-02](#e9--serialization--media-type-coverage)): `application/ld+json`, `application/trig`, `application/n-quads`. Patch body type (where PATCH is implemented): `application/sparql-update`.

---

## 5. Constraints

- **CON-01 — Implementation independence.** These requirements are implementation-agnostic. Any server technology, language, or runtime may be used provided it can **(a)** act as an HTTP/1.1 origin server and **(b)** host an in-process RDF parser / serializer / store sufficient to meet the RDF-semantic requirements (parse, merge, transcode). No specific framework is mandated; platform selection is deferred to architecture.
- **CON-02 — Protocol baseline.** Server MUST behave as an HTTP/1.1 server. *(Trace: GSP §2)*
- **CON-03 — Keyword discipline.** Requirement strength follows RFC 2119 / 8174; keywords are normative only in upper case. *(Trace: GSP §7, RFC 2119, RFC 8174)*
- **CON-04 — IRI → URI.** IRIs are converted to URIs before use in HTTP per RFC 3987; the server MUST accept percent-encoded IRIs. *(Trace: GSP §2, RFC 3987, RFC 3986)*
- **CON-05 — Architectural fidelity (WEBARCH).** A graph IRI identifies *RDF graph content* (an **information resource**), not a fixed byte document. The server MUST be able to return *a* serialization of the held graph rather than only echo stored bytes; identification, interaction, and representation are kept orthogonal. *(Trace: WEBARCH, GSP §4.1, §5.2.1)*

---

## 6. Normative source register (traceability backbone)

### 6.1 Direct (GSP spec)

| Code | Clause |
| :--- | :--- |
| `GSP-§2` | HTTP/1.1 server; interpret requests as graph-management ops |
| `GSP-§3` | Compliant impl MUST accept & handle requests on its Graph Store |
| `GSP-§4.1` | Direct graph identification |
| `GSP-§4.2` | Indirect identification (`?graph=`, `?default`), absolute-IRI rule |
| `GSP-§5` | Parsing, default representation, multipart support |
| `GSP-§5.1` | Status-code obligations (400/404/405/415) |
| `GSP-§5.2` | GET semantics, caching, 406 |
| `GSP-§5.3` | PUT semantics, 201/200/204, MUST NOT touch other resource |
| `GSP-§5.4` | DELETE semantics, 404/200/204/202/403 |
| `GSP-§5.5` | POST = RDF merge; POST-to-store mints graph + Location + 201 |
| `GSP-§5.6` | HEAD = GET without body |
| `GSP-§5.7` | PATCH (Informative) |
| `GSP-§6` | Security: 401/403 |

### 6.2 Transitive (pulled in by reference)

| Code | Source | What it contributes |
| :--- | :--- | :--- |
| `WEBARCH` | Architecture of the WWW | Information-resource concept; httpRange-14; representations vs resources |
| `RFC3986` | URI generic syntax | Absolute-IRI definition; percent-encoding; query component |
| `RFC3987` | IRI | IRI → URI conversion |
| `HTTP` (RFC 9110 / 2616) | HTTP semantics | Method safety/idempotency; conditional requests; caching; status codes |
| `SPARQL-UPDATE` | SPARQL 1.1/1.2 Update | Semantics of `DROP SILENT`, `INSERT DATA`, `DROP GRAPH/DEFAULT`; empty-graph handling |
| `RDF-CONCEPTS` / `RDF-MT` | RDF data model & semantics | Graph = triple set; **RDF merge standardizes blank nodes apart** (not naïve union) |
| `TURTLE` / `NTRIPLES` / `RDFXML` | RDF 1.1 serialization specs | Triple-syntax grammars + media types (mandatory trio) |
| `TRIG` / `NQUADS` | RDF 1.1 dataset serialization specs | Quad/dataset syntaxes; need single-graph ↔ dataset reconciliation ([UR-FMT-04/05](#e9--serialization--media-type-coverage)) |
| `JSON-LD` | JSON-LD 1.1 | Triple- and dataset-capable JSON syntax; `@graph` handling |
| `HTML4-§17.13.4` | HTML 4.01 | `multipart/form-data` structure for multi-document POST |
| `RFC5789` | PATCH method | Patch atomicity (MUST); `Accept-Patch` (MUST); 409/415/422 mapping; preconditions. **Active when PATCH is implemented.** |
| `SPARQL-UPDATE` (patch body) | SPARQL 1.1/1.2 Update | `application/sparql-update` as the PATCH document language |
| `RFC6585` | Additional HTTP status codes | `428 Precondition Required` for the mandatory PATCH precondition |
| `RDFC-1.0` | RDF Dataset Canonicalization | Graph-isomorphism checking in the **test harness** only; off the write path after [OQ-11a](#11-open-questions-for-inception) chose a revision counter |

---

## 7. Epics

| ID | Epic | Focus |
| :--- | :--- | :--- |
| **E1** | Graph identification & routing | direct + indirect |
| **E2** | Retrieval | GET/HEAD + content negotiation + caching |
| **E3** | Replacement | PUT |
| **E4** | Merge & creation | POST |
| **E5** | Removal | DELETE |
| **E6** | RDF processing | parse / serialize / merge correctness |
| **E7** | Protocol correctness | status codes, headers, conditional requests |
| **E8** | Security hooks | authn/authz enforcement points |
| **E9** | Serialization & media-type coverage | trio + JSON-LD + quad formats; dataset reconciliation |
| **E10** | Incremental update (PATCH) | optional; RFC 5789 + SPARQL Update |
| **E11** | Concurrency control & validators | mandatory ETags; conditional PATCH; atomic CAS |

---

## 8. Functional user requirements

> [!NOTE]
> Acceptance criteria use **Given / When / Then**. HTTP examples are illustrative, not prescriptive of routing design. Status codes asserted in a *Then* clause are shown in **bold**; methods, headers, and media types are shown as `code`.

### E1 — Graph identification & routing

#### UR-ID-01 — Direct graph identification
*As a Graph Client, I want to address a named graph by using its IRI as the request URI, so that I can manage it without indirection.*
- **Given** a request URI that maps to graph content, **When** any in-scope method is sent, **Then** the operation targets exactly that graph content.
- *Trace: GSP §4.1; WEBARCH; CON-05*

#### UR-ID-02 — Indirect named-graph identification
*As a Graph Client, I want to target a graph via `?graph=<percent-encoded IRI>` on the Graph Store URL, so that I can manage graphs whose IRIs are not dereferenceable on this server.*
- **Given** `...?graph=http%3A%2F%2Fex.org%2Fg`, **When** received, **Then** the server percent-decodes the value and operates on that graph content.
- *Trace: GSP §4.2; RFC 3986; RFC 3987*

#### UR-ID-03 — Indirect default-graph identification

> [!NOTE]
> Decision **OQ-06**: the default graph is addressable **only** indirectly.

*As a Graph Client, I want `?default` to address the store's default graph.*
- **Given** `...?default`, **When** received, **Then** the operation targets the default graph (SPARQL Update equivalents omit any `GRAPH`).
- The default graph has no direct request-URI form, consistent with its having no IRI in the RDF/SPARQL model.
- *Trace: GSP §4.2, §5; OQ-06*

#### UR-ID-04 — Absolute-IRI enforcement (MUST)
*As a Data Steward, I want non-absolute graph IRIs rejected, so that graph identity is unambiguous.*
- **Given** `?graph=<value>` where value is not an absolute IRI, **When** received, **Then** the server responds **`400 Bad Request`** and performs no mutation.
- *Trace: GSP §4.2 (MUST); RFC 3986*

#### UR-ID-05 — Well-formed but unhostable indirect IRI

> [!NOTE]
> Decision **OQ-08**.

- **Given** an absolute, well-formed `?graph` IRI for which no content exists, **When** `GET`/`HEAD`/`DELETE`/`PATCH`, **Then** **`404 Not Found`** (ordinary absence). For `PATCH` this `404` precedes the [UR-CC-04](#e11--concurrency-control--validators) precondition check (OQ-14).
- **Given** such an IRI that the store refuses to manage by policy (e.g. reserved or foreign namespace), **When** a `PUT`/`POST` would create it, **Then** **`403 Forbidden`** and no mutation.
- *Trace: GSP §4.2, §5.3 (creation refusal), §6; OQ-08*

### E2 — Retrieval (GET/HEAD)

#### UR-GET-01 — Retrieve a serialization (MUST)
*As a Graph Client, I want `GET` to return a serialization of the targeted graph (equivalent to `CONSTRUCT { ?s ?p ?o } WHERE { GRAPH <g> { ?s ?p ?o } }`).*
- **Given** an existing **named** graph (≥ 1 triple), **When** `GET`, **Then** **`200 OK`** + an RDF document serializing that graph.
- **Given** a **named** graph with zero triples, **When** `GET`, **Then** **`404 Not Found`** — a named graph exists iff it holds ≥ 1 triple (OQ-04).
- **Given** the **default graph** (via `?default`), **When** `GET`, **Then** **`200 OK`** even when empty: the default graph always exists and returns an empty serialization rather than `404` (OQ-13).
- *Trace: GSP §5.2 (MUST); OQ-04, OQ-13*

#### UR-GET-02 — Default representation when no `Accept` (MUST)
- **Given** a `GET` with no `Accept` header, **When** served, **Then** the body is **one of the trio**[^trio] with a correct `Content-Type`.
- *Trace: GSP §5 (MUST)*

#### UR-GET-03 — Serialization content negotiation
*As a Graph Client, I want the response in my preferred format from `Accept`.*
- **Given** `Accept: text/turtle`, **When** the graph is held internally, **Then** the server serializes to Turtle regardless of how the data was ingested (transcoding across the trio).
- *Trace: GSP §5.2; HTTP; WEBARCH (multiple representations)*

#### UR-GET-04 — Unsupported representation (SHOULD)
- **Given** an `Accept` naming only unsupported formats, **When** served, **Then** the server SHOULD respond **`406 Not Acceptable`**.
- *Trace: GSP §5.2 (SHOULD)*

#### UR-GET-05 — Information-resource semantics (httpRange-14)
- **Given** a successful `GET` on graph content, **When** responding, **Then** status is `2xx` (`200`), consistent with the resource being an information resource.[^httprange14]
- *Trace: GSP §5.2.1; WEBARCH*

#### UR-HEAD-01 — HEAD = GET without body (MUST NOT body)
- **Given** identical conditions to a `GET`, **When** `HEAD`, **Then** identical status and headers are returned but **no message body**.
- *Trace: GSP §5.6 (MUST NOT)*

### E3 — Replacement (PUT)

#### UR-PUT-01 — Replace graph content (MUST)
*As a Data Steward, I want `PUT` to replace the whole graph (equivalent to `DROP SILENT GRAPH <g>; INSERT DATA { GRAPH <g> {…} }`).*
- **Given** a parseable RDF payload, **When** `PUT`, **Then** prior content of that graph is fully removed and replaced by the payload's triples.
- *Trace: GSP §5.3 (MUST); SPARQL-UPDATE*

#### UR-PUT-02 — No collateral targeting (MUST NOT)
- **Given** a `PUT`, **When** applied, **Then** the server MUST NOT apply the payload to any resource other than the identified graph content.
- *Trace: GSP §5.3 (MUST NOT)*

#### UR-PUT-03 — Create-vs-modify status (MUST)
- **Given** the graph did **not** exist and the payload yields ≥ 1 triple, **When** `PUT` succeeds, **Then** **`201 Created`**.
- **Given** the graph **existed** and the payload yields ≥ 1 triple, **When** `PUT` succeeds, **Then** **`200 OK`** or **`204 No Content`**.
- A `PUT` whose result is empty never yields `201`; it follows [UR-PUT-04](#ur-put-04--empty--zero-triple-body-handling).
- *Trace: GSP §5.3 (MUST); OQ-04*

#### UR-PUT-04 — Empty / zero-triple body handling

> [!NOTE]
> Decision **OQ-04**: empty = absent (named graphs).

- Empty named graphs are not first-class; the server does **not** take GSP §5.3's optional "create an empty graph" path.
- **Given** a body that parses successfully but yields zero triples (e.g. empty Turtle/N-Triples, or prefixes only), **When** `PUT`, **Then** any prior content of the target is removed and, the result being empty, the graph becomes **absent**; the server responds **`204 No Content`** and creates nothing (no `201`).
- **Given** a body that is not valid for the declared `Content-Type` (e.g. zero bytes presented as RDF/XML), **Then** **`400 Bad Request`** (parse failure, UR-RDF-02).
- *Trace: GSP §5.3; SPARQL-UPDATE (`DROP SILENT` + `INSERT DATA {}`); OQ-04*

### E4 — Merge & creation (POST)

#### UR-POST-01 — RDF merge into existing content (MUST)
*As a Data Steward, I want `POST` to merge the payload into the targeted graph (equivalent to `INSERT DATA { GRAPH <g> {…} }`) **without** discarding existing triples.*
- **Given** existing graph G and payload P, **When** `POST`, **Then** the resulting graph is the **RDF merge**[^rdfmerge] of G and P.
- *Trace: GSP §5.5 (MUST); SPARQL-UPDATE*

#### UR-POST-02 — Blank-node correctness in merge (MUST, transitive)
*As a Data Steward, I want merge to follow RDF-merge semantics, not naïve set union.*
- **Given** payload P containing blank nodes, **When** merged into G, **Then** blank nodes are **standardized apart** so that P's blank nodes are not accidentally identified with G's.
- *Trace: RDF-MT / RDF-CONCEPTS (RDF merge); GSP §5.5*

#### UR-POST-03 — Multipart form merge
- **Given** `Content-Type: multipart/form-data` with one or more RDF documents, **When** `POST`, **Then** the server merges the union of those documents' graphs into the targeted content.
- **Given** a part lacks a content-type, **When** processing, **Then** the server MAY infer it from the file extension instead of failing with `400`.
- *Trace: GSP §5.5, §5; HTML4-§17.13.4*

#### UR-POST-04 — POST to the Graph Store mints a new graph (MUST)
*As a Graph Client without authority to choose an IRI, I want to POST data to the store URL and have it create a new graph.*
- **Given** the request URI identifies the Graph Store (not specific content), **When** `POST` with a non-empty body, **Then** a new graph is created, a **fresh graph IRI different from the request IRI** is returned in the **`Location`** header, and status is **`201 Created`**.
- The minted IRI MUST be a server-controlled, opaque, collision-resistant **UUID-based** IRI under the store namespace (e.g. `{store}/graphs/{uuid}`), distinct from the request IRI and not client-guessable (decision OQ-03).
- *Trace: GSP §5.5 (MUST); OQ-03*

#### UR-POST-05 — Empty body to POST (SHOULD)
- **Given** an empty request body, **When** `POST`, **Then** the server SHOULD respond **`204 No Content`**.
- *Trace: GSP §5.5 (SHOULD)*

#### UR-POST-06 — Non-identifying target; POST does not create named graphs

> [!NOTE]
> Decision **OQ-12**: GSP-literal reading of §5.5.

- **Given** a request URI that identifies neither the Graph Store nor existing graph content — **including a well-formed but currently absent named-graph IRI** — **When** `POST`, **Then** **`404 Not Found`**.
- `POST` never creates a graph at a caller-chosen IRI; use `PUT` (caller names it) or POST-to-the-store (server mints it, UR-POST-04). Consistent with empty = absent (OQ-04).
- *Trace: GSP §5.5; OQ-12*

### E5 — Removal (DELETE)

#### UR-DEL-01 — Delete graph content (SHOULD)
*As a Data Steward, I want `DELETE` to remove the targeted graph (equivalent to `DROP GRAPH <g>` / `DROP DEFAULT`).*
- **Given** existing content, **When** `DELETE` succeeds, **Then** **`200 OK`** or **`204 No Content`**; or **`202 Accepted`** if deletion is deferred.
- *Trace: GSP §5.4 (SHOULD / MUST on status)*

#### UR-DEL-02 — Delete of absent content (MUST)
- **Given** no such graph content, **When** `DELETE`, **Then** **`404 Not Found`**.
- *Trace: GSP §5.4 (MUST)*

#### UR-DEL-03 — Honest success + override
- The server SHOULD NOT report success unless it intends to delete or render the content inaccessible.
- **Given** an override policy declines the deletion, **When** `DELETE`, **Then** **`403 Forbidden`**.
- *Trace: GSP §5.4 (SHOULD NOT / 403)*

### E6 — RDF processing

#### UR-RDF-01 — Parse per `Content-Type` (MUST)
- **Given** `PUT`/`POST` with a `Content-Type`, **When** ingesting, **Then** the payload MUST be parsed according to that media type.
- *Trace: GSP §5 (MUST)*

#### UR-RDF-02 — Parse failure ⇒ 400 (MUST)
- **Given** a payload that fails to parse for the declared type, **When** ingesting, **Then** **`400 Bad Request`** and no mutation.
- *Trace: GSP §5.1 (MUST)*

#### UR-RDF-03 — Missing `Content-Type` fallback
- **Given** no `Content-Type`, **When** a sniffing routine clearly identifies a non-RDF/XML RDF syntax, **Then** the server MAY parse as that syntax; otherwise it SHOULD attempt RDF/XML.
- *Trace: GSP §5 (MAY/SHOULD)*

#### UR-RDF-04 — Round-trip integrity
- **Given** data ingested in syntax A and retrieved in syntax B (any supported triple syntax — trio + JSON-LD), **When** compared, **Then** the two represent the **same RDF graph** (isomorphic up to blank-node labelling). Dataset round-trips for quad syntaxes preserve the single targeted graph ([UR-FMT-04/05](#e9--serialization--media-type-coverage)).
- *Trace: WEBARCH; TURTLE/NTRIPLES/RDFXML; JSON-LD 1.1; GSP §4.1*

### E7 — Protocol correctness

#### UR-HTTP-01 — Status-code discipline (MUST)
The server MUST use HTTP status codes per their defined semantics. Canonical mapping:

| Condition | Code | Trace |
| :--- | :--- | :--- |
| Read/replace/delete success (no body) | `200` / `204` | §5.2/5.3/5.4 |
| New graph created (PUT) | `201` | §5.3 |
| New graph minted (POST to store) | `201` + `Location` | §5.5 |
| Deletion deferred | `202` | §5.4 |
| Non-absolute `?graph` IRI | `400` | §4.2 |
| RDF parse failure | `400` | §5.1 |
| Auth required / refused | `401` / `403` | §6 |
| Creation refused by store policy | `403` | §5.3 / §6 |
| Missing required content | `404` | §5.1/5.4/5.5 |
| Unsupported method / malformed syntax | `405` | §5.1 |
| Unacceptable representation | `406` | §5.2 |
| Unintelligible request media type | `415` | §5.1 |
| Conflict with current state (PATCH) | `409` | RFC 5789 |
| Precondition missing (mandatory on PATCH) | `428` | RFC 6585 |
| Precondition failed (stale validator) | `412` | HTTP |
| Unprocessable / multi-graph PATCH | `422` | §5.7 |

> [!NOTE]
> PATCH responses additionally carry an `Accept-Patch` header per UR-PATCH-04; a `415` to any method should name acceptable types. A `405` MUST carry `Allow`; a `401` MUST carry `WWW-Authenticate` (HTTP).

#### UR-HTTP-02 — Unsupported media type (MUST 415)
- **Given** `PUT`/`POST` with a content type the store does not understand, **Then** **`415 Unsupported Media Type`**.
- *Trace: GSP §5.1 (MUST)*

#### UR-HTTP-03 — Method not allowed (MUST 405)
- **Given** an unsupported verb (or malformed/unsupported request syntax), **Then** **`405 Method Not Allowed`**. The response MUST include an `Allow` header listing the methods the resource does support (HTTP requirement).
- *Trace: GSP §5.1 (MUST); HTTP (`Allow` on 405)*

#### UR-HTTP-04 — Conditional requests & caching
- `GET`/`HEAD` responses MUST carry a strong `ETag` (per [UR-CC-01](#e11--concurrency-control--validators)) and SHOULD be cacheable where possible; `Last-Modified` MAY also be supplied (its 1-second granularity makes it unsuitable as the sole write precondition).
- **Given** a changed graph, **When** a cache holds a prior validator, **Then** changed `ETag` / `Last-Modified` / `Content-Length` cause the cache entry to be treated as stale; the server SHOULD honour `If-Modified-Since` / `If-None-Match`.
- *Trace: GSP §5.2, §5.6; HTTP; UR-CC-01/03*

#### UR-HTTP-05 — OPTIONS capability discovery
> [!NOTE]
> Decision **OQ-09 / OQ-10**.

- `OPTIONS` is a first-class method. **Given** `OPTIONS` on a graph resource or the Graph Store, **Then** the server returns `200`/`204` with an `Allow` header listing supported methods and, when PATCH is enabled, an `Accept-Patch` header listing supported patch document types (v1: `application/sparql-update` only).
- *Trace: HTTP (OPTIONS); RFC 5789 (`Accept-Patch`); OQ-09, OQ-10*

### E8 — Security hooks

#### UR-SEC-01 — Authentication challenge (401)
- **Given** an unauthenticated request to mutate protected content, **Then** the server MAY respond **`401 Unauthorized`**; when it does, the response MUST include a `WWW-Authenticate` header (HTTP requirement).
- *Trace: GSP §6; HTTP (`WWW-Authenticate` on 401)*

#### UR-SEC-02 — Authorization refusal (403)
- **Given** authentication that fails the access policy, **Then** **`403 Forbidden`**.
- *Trace: GSP §6*

#### UR-SEC-03 — Pluggable enforcement point

> [!NOTE]
> Decision **OQ-07**.

- Authn/authz MUST be implemented as a pluggable enforcement point that runs ahead of any mutation and can emit `401` / `403`. The concrete scheme (JWT/bearer, mTLS, API key) is configurable with a default shipped; the set of "system-critical" graphs and the access policy are deployment configuration, not hard-coded.
- *Trace: GSP §6; OQ-07*

### E9 — Serialization & media-type coverage

#### UR-FMT-01 — Mandatory triple serializations (MUST)
The server MUST both parse (input) and serialize (output) RDF/XML, Turtle, and N-Triples, and when a `GET` carries no `Accept` the body MUST be one of these three. *(Consolidates UR-GET-02 and UR-RDF-01.)*
- Media types: `application/rdf+xml`, `text/turtle`, `application/n-triples`.
- *Trace: GSP §5 (MUST); RDF 1.1 Turtle / N-Triples / RDF-XML*

#### UR-FMT-02 — Extended serializations (MUST, product-level)

> [!NOTE]
> Promoted from former **OQ-02** — a product requirement *above* the spec floor.

Beyond the trio, the server MUST support JSON-LD, TriG, and N-Quads for both input and content-negotiated output, subject to UR-FMT-04/05. The trio remains the guaranteed fallback, but these formats are first-class for negotiation.
- Media types: `application/ld+json`, `application/trig`, `application/n-quads`.
- *Trace: product decision above GSP §5 floor; JSON-LD 1.1; RDF 1.1 TriG / N-Quads*

#### UR-FMT-03 — Negotiation & fallback
- **Given** an `Accept` listing supported types, **Then** the most-preferred supported serialization is returned.
- **Given** an `Accept` that no supported type satisfies, **Then** **`406 Not Acceptable`** (per UR-GET-04).
- **Given** no `Accept`, **Then** a trio serialization is returned (UR-FMT-01).
- *Trace: GSP §5, §5.2; HTTP*

#### UR-FMT-04 — Dataset (quad) payload semantics on input (MUST)

> [!IMPORTANT]
> GSP operations target a single graph, but TriG / N-Quads / JSON-LD can encode an entire dataset. Strict reconciliation (decision **OQ-02a**) prevents silent cross-graph writes.

When a dataset payload is supplied to a single-graph `PUT`/`POST`, the triples written to the target graph MUST be exactly: the payload's **default graph**, unioned with the payload's **named graph whose IRI equals the target** (if present).
- The server MUST NOT write to any other graph (preserves UR-PUT-02 / UR-POST-01).
- If the payload carries triples in a named graph whose IRI differs from the target — or *any* named graph when the target is the default graph — the server MUST reject with **`400 Bad Request`** and mutate nothing.
- For `PUT`, replacement is computed against this reconciled triple set only.
- **JSON-LD specifics (OQ-02b):** a top-level `@graph` with no surrounding `@id` is the document's default graph and maps to the target; an `@id`-scoped named graph is loaded only if its IRI equals the target, otherwise **`400`**.
- *Trace: GSP §5.3 / §5.5 (MUST NOT collateral targeting); RDF 1.1 datasets; JSON-LD 1.1; SPARQL-UPDATE; OQ-02a, OQ-02b*

#### UR-FMT-05 — Dataset (quad) serialization on output
- **Given** a `GET` for named graph G with a quad-capable `Accept`, **Then** G's triples are emitted labelled by G (TriG `GRAPH <G> { … }`; N-Quads 4th term = G; JSON-LD `@graph` keyed to G); only G's content appears.
- **Given** the default graph with a quad-capable `Accept`, **Then** content is emitted as the dataset default graph (no graph label).
- Output is always the single targeted graph re-expressed in the chosen syntax — never the whole store.
- *Trace: GSP §5.2; RDF 1.1 TriG / N-Quads; JSON-LD 1.1*

### E10 — Incremental update (PATCH)

> [!WARNING]
> GSP §5.7 is **Informative**, so PATCH is **not strictly required**. It is included as a SHOULD-level capability — the only verb offering incremental modification without resending the whole graph. **Where implemented, the RFC 5789 obligations below bind as MUSTs**: partial-credit PATCH is worse than no PATCH.

#### UR-PATCH-01 — Apply a SPARQL Update patch (SHOULD)
*As a Data Steward, I want to transform a graph incrementally rather than replace it wholesale.*
- **Given** `Content-Type: application/sparql-update` whose body is a SPARQL 1.1 Update request scoped to the targeted graph, **When** `PATCH`, **Then** the described changes are applied with SPARQL Update semantics (the body is a *set of instructions*, contrasted with PUT's full-representation replacement).
- *Trace: GSP §5.7; RFC 5789; SPARQL-UPDATE*

#### UR-PATCH-02 — Atomic application (MUST, where implemented)
- **Given** a multi-operation patch, **When** applied, **Then** either the entire change set is applied or none is; the server MUST NOT expose a partially-modified graph.
- *Trace: RFC 5789 (atomicity MUST); NFR-01*

#### UR-PATCH-03 — Single-graph scope enforcement (SHOULD 422)
- **Given** a patch that would modify more than one graph, or a graph other than the one indicated by the request IRI, **When** evaluated, **Then** the server SHOULD respond **`422 Unprocessable Entity`** and apply nothing.
- *Trace: GSP §5.7 (SHOULD); RFC 5789*

#### UR-PATCH-04 — Patch media-type discovery (MUST, where implemented)
- The server MUST advertise its accepted patch media type(s) via the **`Accept-Patch`** response header — at minimum on `OPTIONS` for the resource and in any **`415`** response to a `PATCH`.
- *Trace: RFC 5789 (`Accept-Patch` MUST)*

#### UR-PATCH-05 — PATCH error mapping

| Condition | Code | Strength |
| :--- | :--- | :--- |
| Patch body malformed (not valid SPARQL Update) | `400` | MUST |
| Patch media type unsupported | `415` (+ `Accept-Patch`) | MUST |
| Well-formed but touches > 1 / wrong graph | `422` | SHOULD |
| Cannot be applied to current resource state | `409` | SHOULD |
| `If-Match` precondition **missing** | `428` | MUST |
| `If-Match` precondition **failed** (stale validator) | `412` | MUST |

- A `PATCH` MUST be conditional: the server MUST require `If-Match` and reject lost-update hazards per [UR-CC-04](#e11--concurrency-control--validators) (`428` if absent, `412` if stale). RFC 5789 warns PATCH is neither safe nor idempotent, so the precondition is mandatory, not advisory.
- *Trace: GSP §5.7; RFC 5789; RFC 6585; HTTP; UR-CC-04*

#### UR-PATCH-06 — Capability discovery via OPTIONS
- Subsumed by the first-class [UR-HTTP-05](#ur-http-05--options-capability-discovery): `OPTIONS` advertises `Allow` and, when PATCH is enabled, `Accept-Patch` (v1 lists only `application/sparql-update`).
- *Trace: RFC 5789; HTTP; UR-HTTP-05*

### E11 — Concurrency control & validators

> [!IMPORTANT]
> Promoted from former OQ-11. Optimistic concurrency is **MUST**, not advisory. This makes ETags mandatory and forces a deliberate stance on the representation-vs-state nature of the validator (UR-CC-03), since one graph has many serializations.

#### UR-CC-01 — Mandatory strong ETag on retrieval (MUST)
*As a Graph Client, I want every readable graph to expose a validator, so that I can perform safe conditional writes.*
- **Given** a `GET` or `HEAD` on existing graph content, **Then** the response MUST include a strong `ETag`. *(Promotes UR-HTTP-04's validator clause from SHOULD to MUST; HEAD inherits this via UR-HEAD-01.)*
- *Trace: HTTP §8.8; precondition for UR-CC-04*

#### UR-CC-02 — State-derived validator & version token (MUST)
- The `ETag` MUST be a strong validator backed by a **monotonic per-graph revision counter** (decision OQ-11a), incremented on every committed mutation, so the validator changes iff the graph's triple set changes.
- Content-hash validators were considered and rejected for v1 to keep RDF canonicalisation off the write path (RISK-09 closed).
- The store MUST persist the counter durably (survives restart, NFR-08), and the increment MUST occur inside the same transaction as the mutation (UR-CC-05) so an increment can never be skipped.
- *Trace: HTTP §8.8 (strong validators); OQ-11a*

#### UR-CC-03 — Validator under content negotiation (MUST)
> [!WARNING]
> **The hard case.** One graph state has multiple serializations, so a purely state-based ETag mis-serves conditional `GET` across formats, while a purely representation-based ETag cannot anchor a write precondition.

- The emitted `ETag` MUST compose **both** the state token **and** a representation discriminator (the negotiated media type), and every negotiated response MUST send `Vary: Accept`.
- Conditional reads (`If-None-Match`) MUST compare the full ETag (state + representation).
- Conditional writes (`If-Match`) MUST compare the **state-token component only**, so a client that read the graph as Turtle may safely precondition a patch regardless of the format it read.
- **v1 encoding (OQ-11c):** a strong, **client-opaque** ETag of the form `"{graphId}.{rev}.{fmt}"`. Clients MUST treat it as opaque; `If-Match` comparison extracts the `rev` component server-side. The encoding MAY change without notice.
- *Trace: HTTP (representation-specific validators, `Vary`); WEBARCH; CON-05; OQ-11c*

#### UR-CC-04 — Mandatory precondition on PATCH (MUST)
- A `PATCH` request MUST carry an `If-Match` header. If absent, the server MUST respond **`428 Precondition Required`** and mutate nothing.
- If the supplied validator's state component does not match the graph's current state, the server MUST respond **`412 Precondition Failed`** and mutate nothing.
- Target existence is evaluated **first** (decision OQ-14): a `PATCH` to an absent graph returns **`404`** *before* any precondition check (404 precedes 428). PATCH cannot create a graph — no validator is obtainable for absent content; use `PUT` to create.
- *Trace: RFC 6585 (428); HTTP (412); OQ-14; supersedes the SHOULD in former UR-PATCH-05*

#### UR-CC-05 — Atomic check-and-apply (MUST)
- The compare-and-swap MUST be realised inside a **single store transaction** (decision OQ-05): read current revision → verify `If-Match` → apply mutation → increment revision, all committed atomically. The store's transaction isolation provides the test-and-set; no concurrent write can interleave between validation and application.
- A losing writer in a race MUST receive **`412`**, never a silent overwrite.
- *Trace: NFR-02; OQ-05; HTTP*

#### UR-CC-06 — Conditional writes for PUT/DELETE (MUST honour, MUST NOT require)
- `PUT` and `DELETE` MUST honour `If-Match` / `If-None-Match` / `If-Unmodified-Since` **when present** (failed → `412`; `If-None-Match: *` enables create-only PUT), but MUST NOT *require* them — preserving GSP's unconditional `PUT`/`DELETE` semantics. Only PATCH is mandatorily conditional (decision OQ-11b).
- *Trace: GSP §5.3 / §5.4; HTTP*

#### UR-CC-07 — POST-merge exemption (rationale)
- `POST` merges are additive set-unions and therefore commute; concurrent merges cannot lose data, so preconditions are NOT required for `POST`. The server MAY still honour `If-Match` when a client supplies it.
- *Trace: GSP §5.5; RDF merge (RDF-MT)*

---

## 9. Non-functional requirements

| ID | Requirement | Strength | Trace |
| :--- | :--- | :--- | :--- |
| **NFR-01** | A mutating request (`PUT`/`POST`/`DELETE`/`PATCH`) is all-or-nothing: a parse failure, scope violation, or policy refusal leaves stored content unchanged. | MUST | UR-RDF-02, UR-PATCH-02, §5.x |
| **NFR-02** | Concurrent mutations to one graph never corrupt or interleave; every conditional mutation is an atomic compare-and-swap on the revision counter inside one store transaction (loser → `412`). | MUST | UR-CC-05; OQ-05 |
| **NFR-03** | `GET`/`HEAD` safe; `PUT`/`DELETE` idempotent; `POST`/`PATCH` neither. The PATCH lost-update exposure is closed by the mandatory precondition (UR-CC-04). | MUST | HTTP; RFC 5789/6585 |
| **NFR-04** | Large RDF payloads handled via streaming parse/serialize to bound memory. | SHOULD | — |
| **NFR-05** | Each request emits a structured log: method, target graph IRI (direct/indirect), negotiated media type, outcome code. | SHOULD | — |
| **NFR-06** | Full IRI (RFC 3987) handling end-to-end, including non-ASCII IRIs after percent-decoding. | MUST | RFC 3987 |
| **NFR-07** | The implementation is exercisable by the W3C RDF/SPARQL GSP test suite. | SHOULD | test suite |
| **NFR-08** | Committed graph state (and the revision counter) survives process restarts. | MUST | — |

> [!NOTE]
> **Residual architecture decision (OQ-05, non-blocking):** pick the concrete isolation level backing NFR-02 — read-committed with row/document locking on the graph record, or serializable.

---

## 10. Acceptance criteria (phase exit)

The build is acceptance-ready when:

- [ ] **G1** — Every `MUST` / `MUST NOT` requirement has a passing automated test.
- [ ] **G2** — Every `SHOULD` requirement is met or has a recorded, approved waiver.
- [ ] **G3** — The status-code matrix (UR-HTTP-01) is verified for each method × condition.
- [ ] **G4** — Round-trip isomorphism (UR-RDF-04) passes across all supported triple serializations (trio + JSON-LD), and dataset round-trips (UR-FMT-04/05) preserve the single targeted graph for TriG / N-Quads / JSON-LD.
- [ ] **G5** — RDF-merge blank-node correctness (UR-POST-02) is verified with adversarial fixtures.
- [ ] **G6** — Direct and indirect identification produce identical effects on the same graph (UR-ID-01 vs UR-ID-02/03).
- [ ] **G7** — Dataset-payload reconciliation (UR-FMT-04): a payload naming a non-target graph yields **`400`** and no mutation.
- [ ] **G8** — Where PATCH is implemented: atomicity (UR-PATCH-02), scope `422` (UR-PATCH-03), `Accept-Patch` advertising (UR-PATCH-04), and the error mapping (UR-PATCH-05) pass. PATCH SHOULDs may be waived (G2); the RFC 5789/6585 MUSTs may not.
- [ ] **G9** — Concurrency control (E11): `GET`/`HEAD` always emit a strong `ETag` (UR-CC-01); `PATCH` without `If-Match` → **`428`** and with a stale validator → **`412`**, no mutation (UR-CC-04); two racing conditional writers resolve to exactly one success + one **`412`** (UR-CC-05); and the `ETag` behaves correctly across negotiated formats (UR-CC-03).

---

## 11. Open questions for inception

> [!IMPORTANT]
> **Status: all open questions resolved.** OQ-01–OQ-11c via the inception Q&A sessions; OQ-12–OQ-14 added and resolved during the final expert review. The only residual is a non-blocking architecture detail (isolation level under OQ-05). All decisions are folded into the requirements, assumptions, and risks above.

- **OQ-01 — RESOLVED.** Conformance scope = all five core verbs MUST be implemented; all MUST/MUST NOT honoured; all SHOULDs honoured or waived (ASM-01). No core method may be omitted. PATCH stays optional (E10).
- **OQ-02 — PROMOTED → UR-FMT-02.** Extended-format support is now a requirement: JSON-LD, TriG, N-Quads mandatory alongside the trio. Residual sub-questions:
  - **OQ-02a — RESOLVED.** Strict reconciliation: a dataset payload naming any graph other than the target is rejected with `400`, never silently dropped (UR-FMT-04).
  - **OQ-02b — RESOLVED.** JSON-LD follows dataset semantics: top-level `@graph` maps to the target; `@id`-scoped named graphs are subject to strict reconciliation (UR-FMT-04).
- **OQ-03 — RESOLVED.** Minted graph IRI = server-controlled opaque UUID under the store namespace (`{store}/graphs/{uuid}`), non-guessable (UR-POST-04).
- **OQ-04 — RESOLVED.** Empty = absent for named graphs; a named graph exists iff it has ≥ 1 triple (ASM-04, UR-GET-01, UR-PUT-03/04).
- **OQ-05 — RESOLVED.** Atomic compare-and-swap via a single store transaction (NFR-02 / UR-CC-05). Residual (architecture, non-blocking): pick the concrete isolation level.
- **OQ-06 — RESOLVED.** Default graph addressable only via `?default` (no direct URI form) — UR-ID-03.
- **OQ-07 — RESOLVED.** Pluggable auth enforcement point emitting `401`/`403` with a configurable scheme and shipped default; policy and "system-critical" graph set are deployment config (UR-SEC-03).
- **OQ-08 — RESOLVED.** Well-formed unhostable `?graph` IRI: `404` when merely absent, `403` when the store refuses the namespace on create (UR-ID-05).
- **OQ-09 — RESOLVED.** v1 supports only `application/sparql-update` as the patch body, advertised via `Accept-Patch`; other patch languages are non-breaking future additions (UR-PATCH-01, UR-HTTP-05).
- **OQ-10 — RESOLVED.** `OPTIONS` is first-class: returns `Allow` and (when PATCH enabled) `Accept-Patch` (UR-HTTP-05).
- **OQ-11 — PROMOTED → UR-CC-04.** Optimistic concurrency for PATCH is mandatory (`If-Match` required; `428`/`412` enforced). Residual sub-questions:
  - **OQ-11a — RESOLVED.** Monotonic per-graph revision counter, incremented inside the write transaction (UR-CC-02/05). Content-hash rejected for v1 (RISK-09 closed).
  - **OQ-11b — RESOLVED.** Mandatory precondition is PATCH-only; PUT/DELETE stay unconditional but honour `If-Match` when present (UR-CC-06).
  - **OQ-11c — RESOLVED.** ETag = strong, client-opaque `"{graphId}.{rev}.{fmt}"`; `If-Match` compares the `rev` component server-side (UR-CC-03).
- **OQ-12 — RESOLVED.** *(review)* POST to a well-formed but absent named-graph IRI → `404`; POST never creates at a caller-chosen IRI (PUT names, POST-to-store mints). GSP-literal, consistent with empty = absent (UR-POST-06).
- **OQ-13 — RESOLVED.** *(review)* The default graph is exempt from empty = absent: it always exists and `GET ?default` returns `200` even when empty (UR-GET-01, ASM-04).
- **OQ-14 — RESOLVED.** *(review)* PATCH precedence: existence is checked before the precondition, so PATCH to an absent graph → `404` before `428`; PATCH cannot create (UR-CC-04, UR-ID-05).

---

## 12. Risks

- **RISK-01 — Under-specified conformance.** GSP §7/§11/§12 are TODO in the WD; "strict requirements" are assembled from scattered clauses and may shift in later drafts. *Mitigation: pin to the 19 Dec 2024 WD; isolate spec-version assumptions.*
- **RISK-02 — RDF-merge subtlety.** Naïve union mishandles blank nodes and corrupts data silently. *Mitigation: UR-POST-02 + adversarial test fixtures.*
- **RISK-03 — Transcoding fidelity.** Lossy conversion across syntaxes (datatypes, language tags, base/relative IRIs) breaks UR-RDF-04. *Mitigation: model-level (not text-level) conversion via the RDF data model.*
- **RISK-04 — Aging HTTP reference.** Spec cites RFC 2616; modern stacks implement RFC 9110. *Mitigation: ASM-03.*
- **RISK-05 — Indirect-identification routing.** Query-component routing can collide with framework conventions and percent-encoding edge cases. *Mitigation: explicit decode + absolute-IRI validation (UR-ID-04).*
- **RISK-06 — MITIGATED.** Quad/dataset semantic mismatch — dataset syntaxes can smuggle triples into non-target graphs. *Mitigation in force: strict reconciliation + `400` (UR-FMT-04); policy confirmed via OQ-02a.*
- **RISK-07 — PATCH lost updates & partial application.** A non-atomic or unconditional PATCH can corrupt a graph or overwrite concurrent changes. *Mitigation: atomicity MUST (UR-PATCH-02) + **mandatory** precondition with atomic compare-and-swap (UR-CC-04/05); `428`/`412` enforced; RFC 5789/6585 MUSTs are non-waiverable.*
- **RISK-08 — MITIGATED.** Validator/negotiation correctness — a state-only ETag breaks conditional `GET` across serializations; a representation-only ETag cannot anchor a write precondition. *Mitigation in force: composite client-opaque `"{graphId}.{rev}.{fmt}"` ETag (OQ-11c) with `Vary: Accept`; reads compare the full ETag, writes compare the `rev` component (UR-CC-03); covered by gate G9.*
- **RISK-09 — CLOSED.** Canonicalisation cost on the write path. *Resolved by OQ-11a: the revision counter avoids per-write canonicalisation; canonicalisation is confined to the test harness (UR-RDF-04), off the hot path.*

---

## 13. Traceability summary

Every `UR-` / `NFR-` carries an inline *Trace* tag mapping it to a direct GSP clause and/or a transitive source in the [§6 register](#6-normative-source-register-traceability-backbone). The register is the canonical index for inception to verify coverage: each §6.1 and §6.2 row should map to at least one requirement; gaps are inception findings. The full forward and reverse maps are in [Appendix A](#appendix-a-source-clause-traceability-matrix).

---

## Appendix A. Source-clause traceability matrix

Two views. **A.1 (forward)** accounts for every requirement against its sources; **A.2 (reverse)** checks that every normative source in the §6 register is exercised by at least one requirement — the coverage test named in §13. Decisions are the resolved OQs from §11.

<details>
<summary><strong>A.1 — Forward: requirement → sources</strong> (click to expand; 67 rows)</summary>

| Req | Title | Direct (GSP) | Transitive | Decision |
| :--- | :--- | :--- | :--- | :--- |
| CON-01 | Implementation independence | — | — | — |
| CON-02 | HTTP/1.1 baseline | §2 | — | — |
| CON-03 | Keyword discipline | §7 | RFC 2119/8174 | — |
| CON-04 | IRI → URI | §2 | RFC 3987/3986 | — |
| CON-05 | Architectural fidelity | §4.1, §5.2.1 | WEBARCH | — |
| UR-ID-01 | Direct identification | §4.1 | WEBARCH | — |
| UR-ID-02 | Indirect named-graph | §4.2 | RFC 3986/3987 | — |
| UR-ID-03 | Indirect default-graph | §4.2, §5 | — | OQ-06 |
| UR-ID-04 | Absolute-IRI enforcement | §4.2 | RFC 3986 | — |
| UR-ID-05 | Unhostable IRI | §4.2, §5.3, §6 | — | OQ-08 |
| UR-GET-01 | Retrieve serialization | §5.2 | — | OQ-04, OQ-13 |
| UR-GET-02 | Default representation | §5 | — | — |
| UR-GET-03 | Content negotiation | §5.2 | HTTP, WEBARCH | — |
| UR-GET-04 | Unsupported repr. (406) | §5.2 | — | — |
| UR-GET-05 | Information-resource (httpRange-14) | §5.2.1 | WEBARCH | — |
| UR-HEAD-01 | HEAD = GET, no body | §5.6 | — | — |
| UR-PUT-01 | Replace content | §5.3 | SPARQL-UPDATE | — |
| UR-PUT-02 | No collateral targeting | §5.3 | — | — |
| UR-PUT-03 | Create-vs-modify status | §5.3 | — | OQ-04 |
| UR-PUT-04 | Empty = absent | §5.3 | SPARQL-UPDATE | OQ-04 |
| UR-POST-01 | RDF merge | §5.5 | SPARQL-UPDATE | — |
| UR-POST-02 | Blank-node correctness | §5.5 | RDF-MT / RDF-CONCEPTS | — |
| UR-POST-03 | Multipart merge | §5.5, §5 | HTML4-§17.13.4 | — |
| UR-POST-04 | Mint graph on POST-to-store | §5.5 | — | OQ-03 |
| UR-POST-05 | Empty body (204) | §5.5 | — | — |
| UR-POST-06 | Non-identifying target (404); no POST-create | §5.5 | — | OQ-12 |
| UR-DEL-01 | Delete content | §5.4 | — | — |
| UR-DEL-02 | Delete absent (404) | §5.4 | — | — |
| UR-DEL-03 | Honest success / override | §5.4 | — | — |
| UR-RDF-01 | Parse per Content-Type | §5 | — | — |
| UR-RDF-02 | Parse failure (400) | §5.1 | — | — |
| UR-RDF-03 | Missing Content-Type fallback | §5 | — | — |
| UR-RDF-04 | Round-trip integrity | §4.1 | WEBARCH, TURTLE/NTRIPLES/RDFXML, JSON-LD, RDFC-1.0 | — |
| UR-HTTP-01 | Status-code discipline | §4.2, §5.1–§5.7, §6 | HTTP, RFC 5789, RFC 6585 | — |
| UR-HTTP-02 | 415 unsupported media | §5.1 | — | — |
| UR-HTTP-03 | 405 method not allowed | §5.1 | HTTP (`Allow`) | — |
| UR-HTTP-04 | Conditional & caching | §5.2, §5.6 | HTTP | — |
| UR-HTTP-05 | OPTIONS first-class | — | HTTP, RFC 5789 | OQ-09, OQ-10 |
| UR-SEC-01 | Auth challenge (401) | §6 | HTTP (`WWW-Authenticate`) | — |
| UR-SEC-02 | Authz refusal (403) | §6 | — | — |
| UR-SEC-03 | Pluggable enforcement | §6 | — | OQ-07 |
| UR-FMT-01 | Mandatory trio | §5 | TURTLE/NTRIPLES/RDFXML | — |
| UR-FMT-02 | Extended serializations | §5 (floor) | JSON-LD, TRIG/NQUADS | OQ-02 |
| UR-FMT-03 | Negotiation & fallback | §5, §5.2 | HTTP | — |
| UR-FMT-04 | Dataset payload (input) | §5.3, §5.5 | RDF-CONCEPTS, JSON-LD, SPARQL-UPDATE | OQ-02a, OQ-02b |
| UR-FMT-05 | Dataset serialization (output) | §5.2 | TRIG/NQUADS, JSON-LD | — |
| UR-PATCH-01 | SPARQL Update patch | §5.7 | RFC 5789, SPARQL-UPDATE | OQ-09 |
| UR-PATCH-02 | Atomic application | — | RFC 5789 | — |
| UR-PATCH-03 | Single-graph scope (422) | §5.7 | RFC 5789 | — |
| UR-PATCH-04 | Accept-Patch discovery | — | RFC 5789 | OQ-09 |
| UR-PATCH-05 | PATCH error mapping | §5.7 | RFC 5789, RFC 6585, HTTP | OQ-11 → UR-CC-04 |
| UR-PATCH-06 | OPTIONS discovery | — | RFC 5789, HTTP | OQ-10 |
| UR-CC-01 | Mandatory strong ETag | — | HTTP | OQ-11 |
| UR-CC-02 | Version token | — | HTTP | OQ-11a |
| UR-CC-03 | Validator under negotiation | — | HTTP, WEBARCH | OQ-11c |
| UR-CC-04 | Mandatory PATCH precondition | — | RFC 6585, HTTP | OQ-11, OQ-14 |
| UR-CC-05 | Atomic check-and-apply | — | HTTP | OQ-05 |
| UR-CC-06 | Conditional PUT/DELETE | §5.3, §5.4 | HTTP | OQ-11b |
| UR-CC-07 | POST-merge exemption | §5.5 | RDF-MT | — |
| NFR-01 | Atomicity | §5.3–§5.5 | — | — |
| NFR-02 | Concurrency safety | — | HTTP | OQ-05 |
| NFR-03 | Idempotency/safety | — | HTTP, RFC 5789/6585 | — |
| NFR-04 | Payload scalability | — | — | engineering |
| NFR-05 | Observability | — | — | engineering |
| NFR-06 | Internationalization | — | RFC 3987 | — |
| NFR-07 | Conformance testability | test suite | — | — |
| NFR-08 | Persistence durability | — | — | engineering |

</details>

<details>
<summary><strong>A.2 — Reverse: source clause → requirements (coverage check)</strong> (click to expand)</summary>

**Direct (§6.1)**

| Source | Requirements citing it |
| :--- | :--- |
| `GSP-§2` | CON-02, CON-04 |
| `GSP-§3` | ⚠ no dedicated UR — broad "MUST accept & handle" satisfied **collectively** by E1–E5 + ASM-01 (noted, not a gap) |
| `GSP-§4.1` | CON-05, UR-ID-01, UR-RDF-04 |
| `GSP-§4.2` | UR-ID-02, UR-ID-03, UR-ID-04, UR-ID-05, UR-HTTP-01 |
| `GSP-§5` | UR-GET-02, UR-RDF-01, UR-RDF-03, UR-FMT-01, UR-FMT-02, UR-FMT-03, UR-POST-03, UR-ID-03 |
| `GSP-§5.1` | UR-RDF-02, UR-HTTP-01, UR-HTTP-02, UR-HTTP-03 |
| `GSP-§5.2` | UR-GET-01, UR-GET-03, UR-GET-04, UR-HTTP-01, UR-HTTP-04, UR-FMT-03, UR-FMT-05 |
| `GSP-§5.2.1` | CON-05, UR-GET-05 |
| `GSP-§5.3` | UR-PUT-01..04, UR-FMT-04, UR-ID-05, UR-CC-06, UR-HTTP-01, NFR-01 |
| `GSP-§5.4` | UR-DEL-01..03, UR-CC-06, UR-HTTP-01, NFR-01 |
| `GSP-§5.5` | UR-POST-01..06, UR-FMT-04, UR-CC-07, UR-HTTP-01, NFR-01 |
| `GSP-§5.6` | UR-HEAD-01, UR-HTTP-04 |
| `GSP-§5.7` | UR-PATCH-01, UR-PATCH-03, UR-PATCH-05, UR-HTTP-01 |
| `GSP-§6` | UR-SEC-01..03, UR-ID-05, UR-HTTP-01 |
| `GSP-§7` | CON-03 |

**Transitive (§6.2)**

| Source | Requirements citing it |
| :--- | :--- |
| `WEBARCH` | CON-05, UR-ID-01, UR-GET-03, UR-GET-05, UR-RDF-04, UR-CC-03 |
| `RFC3986` | CON-04, UR-ID-02, UR-ID-04 |
| `RFC3987` | CON-04, UR-ID-02, NFR-06 |
| `HTTP` (RFC 9110/2616) | UR-GET-03, UR-HTTP-01/03/04/05, UR-SEC-01, UR-FMT-03, UR-PATCH-05/06, UR-CC-01..06, NFR-02, NFR-03 |
| `SPARQL-UPDATE` | UR-PUT-01, UR-PUT-04, UR-POST-01, UR-FMT-04, UR-PATCH-01 |
| `RDF-CONCEPTS` / `RDF-MT` | UR-POST-02, UR-FMT-04, UR-CC-07 |
| `TURTLE` / `NTRIPLES` / `RDFXML` | UR-RDF-04, UR-FMT-01 |
| `TRIG` / `NQUADS` | UR-FMT-02, UR-FMT-04, UR-FMT-05 |
| `JSON-LD` | UR-RDF-04, UR-FMT-02, UR-FMT-04, UR-FMT-05 |
| `HTML4-§17.13.4` | UR-POST-03 |
| `RFC5789` | UR-HTTP-01/05, UR-PATCH-01..06, NFR-03 |
| `SPARQL-UPDATE` (patch body) | UR-PATCH-01, UR-HTTP-05 |
| `RFC6585` | UR-HTTP-01, UR-CC-04, NFR-03 |
| `RDFC-1.0` | UR-RDF-04 (test harness only) |

</details>

**Coverage result.** Every §6.1 and §6.2 source maps to at least one requirement. The single advisory finding is `GSP-§3`, a system-wide obligation with no one-to-one requirement; it is discharged collectively by the method epics plus ASM-01, and recorded here rather than treated as a gap.

---

[^trio]: The **mandatory trio** is RDF/XML, Turtle, and N-Triples — the three serializations GSP requires a server to be able to return when the client sends no `Accept` header (§5).
[^httprange14]: **httpRange-14** is the W3C TAG resolution that a URI returning a `2xx` to `GET` denotes an *information resource*. GSP relies on it so a graph IRI dereferences to graph content. See WEBARCH and the TAG finding.
[^rdfmerge]: An **RDF merge** is the union of two graphs *after* standardizing apart their blank nodes, so blank nodes from one graph are never accidentally identified with the other's (RDF Semantics). A naïve set union is not an RDF merge.

*End of URD.*
