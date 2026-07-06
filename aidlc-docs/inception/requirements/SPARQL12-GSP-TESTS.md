# Test Matrix & Acceptance Gates

#normative #conformance #source
## SPARQL 1.2 Graph Store Protocol Server

**Companion to:** `URD-SPARQL12-GSP.md`
**Purpose:** turn the URD's requirements, status-code matrix (UR-HTTP-01), and acceptance criteria (§10) into an executable verification plan for the AIDLC build/verify phases.
**Conformance baseline:** SPARQL 1.2 GSP, W3C WD 19 Dec 2024, plus the resolved decisions OQ-01…OQ-11c.

---

## 1. How to use this document

Each test case (TC) traces to one or more URD requirements and to the normative source behind them, so coverage can be checked both ways. **Strength** is inherited from the requirement: a failing `MUST` test blocks release; a failing `SHOULD` test requires a logged waiver (gate G2). The acceptance gates in §11 are the phase-exit contract; every gate names the test families that satisfy it.

Conventions:
- *Scenario* is Given → When; *Expected* is the observable Then (status + decisive headers/body).
- "trio" = RDF/XML + Turtle + N-Triples; "dataset syntaxes" = TriG, N-Quads, JSON-LD-with-`@graph`.
- A graph "exists" iff it holds ≥1 triple (OQ-04).

---

## 2. Status-code conformance matrix (method × condition)

Verified by the `TC-HTTP-01` family; this is the grid form of UR-HTTP-01.

| Condition | GET | HEAD | PUT | POST | DELETE | PATCH | OPTIONS |
|-----------|-----|------|-----|------|--------|-------|---------|
| Success, body returned | 200 | 200† | — | — | — | — | — |
| Success, no body | — | — | 200/204 | — | 200/204 | 200/204 | 200/204 |
| Created (new graph) | — | — | 201 | — | — | — | — |
| Created (minted, +`Location`) | — | — | — | 201 | — | — | — |
| Accepted (deferred) | — | — | — | — | 202 | — | — |
| Target absent | 404 | 404 | (creates) | 404‡ | 404 | 404 | — |
| Non-absolute `?graph` IRI | 400 | 400 | 400 | 400 | 400 | 400 | — |
| Parse / body malformed | — | — | 400 | 400 | — | 400 | — |
| Unauthenticated / refused | 401/403 | 401/403 | 401/403 | 401/403 | 401/403 | 401/403 | — |
| Creation refused by policy | — | — | 403 | 403 | — | — | — |
| Method not allowed / bad syntax | 405 | 405 | 405 | 405 | 405 | 405 | — |
| No acceptable representation | 406 | 406 | — | — | — | — | — |
| Unsupported media type | — | — | 415 | 415 | — | 415§ | — |
| Conflict with current state | — | — | — | — | — | 409 | — |
| Precondition missing | — | — | — | — | — | 428 | — |
| Precondition failed (stale) | — | — | 412¶ | — | 412¶ | 412 | — |
| Unprocessable / multi-graph patch | — | — | — | — | — | 422 | — |

† HEAD returns GET's status/headers with no body (UR-HEAD-01). ‡ POST to a target identifying neither store nor content. § PATCH 415 carries `Accept-Patch`. ¶ Only when the client supplied a conditional header (UR-CC-06).

---

## 3. E1 — Identification & routing

| Test ID | Scenario (Given → When) | Expected (Then) | Trace | Strength |
|---------|--------------------------|------------------|-------|----------|
| TC-ID-01 | A named-graph request URI → PUT then GET | round-trips to the same graph | UR-ID-01 | MUST |
| TC-ID-02 | `?graph=<percent-encoded abs IRI>` → any verb | operates on the decoded graph | UR-ID-02 | MUST |
| TC-ID-03 | `?default` → any verb | targets the default graph | UR-ID-03 | MUST |
| TC-ID-04 | Attempt a direct path for the default graph | not routed / 404 — default is indirect-only | UR-ID-03 (OQ-06) | MUST |
| TC-ID-05 | `?graph=<relative/opaque value>` | 400, no mutation | UR-ID-04 | MUST |
| TC-ID-06 | Same graph addressed directly vs `?graph=` | identical content & effects | UR-ID-01/02 | MUST |
| TC-ID-07 | Absolute, unhostable IRI, no content → GET/DELETE | 404 | UR-ID-05 (OQ-08) | MUST |
| TC-ID-08 | Reserved/foreign-namespace IRI → PUT/POST create | 403, no mutation | UR-ID-05 (OQ-08) | MUST |

---

## 4. E2 — Retrieval (GET/HEAD)

| Test ID    | Scenario                                            | Expected                                        | Trace             | Strength |
| ---------- | --------------------------------------------------- | ----------------------------------------------- | ----------------- | -------- |
| TC-GET-01  | GET graph with ≥1 triple                            | 200 + RDF serialization                         | UR-GET-01         | MUST     |
| TC-GET-02  | GET zero-triple graph                               | 404 (empty = absent)                            | UR-GET-01 (OQ-04) | MUST     |
| TC-GET-03  | GET, no `Accept`                                    | body is a trio member + matching `Content-Type` | UR-GET-02         | MUST     |
| TC-GET-04  | Data ingested as RDF/XML, GET `Accept: text/turtle` | 200, Turtle (transcoded)                        | UR-GET-03         | MUST     |
| TC-GET-05  | GET `Accept` listing only unsupported types         | 406                                             | UR-GET-04         | SHOULD   |
| TC-GET-06  | GET on existing content                             | status is 2xx (httpRange-14)                    | UR-GET-05         | MUST     |
| TC-HEAD-01 | HEAD vs GET on same graph                           | identical status+headers, **no body**           | UR-HEAD-01        | MUST     |
| TC-HEAD-02 | HEAD on absent graph                                | 404, no body                                    | UR-HEAD-01        | MUST     |

---

## 5. E3 — Replacement (PUT)

| Test ID | Scenario | Expected | Trace | Strength |
|---------|----------|----------|-------|----------|
| TC-PUT-01 | PUT over a graph with prior triples | prior content fully replaced | UR-PUT-01 | MUST |
| TC-PUT-02 | PUT targeting graph G | no other graph mutated | UR-PUT-02 | MUST (NOT) |
| TC-PUT-03 | PUT (≥1 triple) to absent graph | 201 Created | UR-PUT-03 | MUST |
| TC-PUT-04 | PUT (≥1 triple) to existing graph | 200 or 204 | UR-PUT-03 | MUST |
| TC-PUT-05 | PUT parseable zero-triple body to existing graph | 204; graph becomes absent; later GET → 404; **no 201** | UR-PUT-04 (OQ-04) | MUST |
| TC-PUT-06 | PUT zero bytes declared as RDF/XML | 400 (invalid for type) | UR-PUT-04 / UR-RDF-02 | MUST |

---

## 6. E4 — Merge & creation (POST)

| Test ID | Scenario | Expected | Trace | Strength |
|---------|----------|----------|-------|----------|
| TC-POST-01 | POST payload into existing graph | result = RDF merge (existing retained + new added) | UR-POST-01 | MUST |
| TC-POST-02 | POST payload containing blank nodes (adversarial fixture) | blank nodes standardized apart; no accidental identification with existing bnodes | UR-POST-02 | MUST |
| TC-POST-03 | `multipart/form-data` with ≥2 RDF documents | merge of all parts into target | UR-POST-03 | MUST |
| TC-POST-04 | multipart part without content-type but known extension | inferred type, no 400 | UR-POST-03 | MAY |
| TC-POST-05 | POST non-empty body to the Graph Store URL | 201 + `Location` = fresh IRI ≠ request IRI | UR-POST-04 (OQ-03) | MUST |
| TC-POST-06 | Inspect minted IRI | opaque UUID under store namespace, non-guessable | UR-POST-04 (OQ-03) | MUST |
| TC-POST-07 | POST empty body | 204 | UR-POST-05 | SHOULD |
| TC-POST-08 | POST to URI identifying neither store nor content | 404 | UR-POST-06 | MUST |
| TC-POST-09 | POST (≥1 triple) to absent named graph | graph springs into existence via merge | UR-POST-01 / OQ-04 | MUST |

---

## 7. E5 — Removal (DELETE)

| Test ID | Scenario | Expected | Trace | Strength |
|---------|----------|----------|-------|----------|
| TC-DEL-01 | DELETE existing graph | 200/204; later GET → 404 | UR-DEL-01 | MUST (on status) |
| TC-DEL-02 | DELETE where enactment deferred | 202 | UR-DEL-01 | MUST |
| TC-DEL-03 | DELETE absent graph | 404 | UR-DEL-02 | MUST |
| TC-DEL-04 | DELETE overridden by policy | 403; content retained | UR-DEL-03 | SHOULD |

---

## 8. E6 — RDF processing

| Test ID | Scenario | Expected | Trace | Strength |
|---------|----------|----------|-------|----------|
| TC-RDF-01 | PUT/POST with each supported `Content-Type` | parsed per declared type | UR-RDF-01 | MUST |
| TC-RDF-02 | Syntactically invalid payload for declared type | 400, no mutation | UR-RDF-02 | MUST |
| TC-RDF-03 | No `Content-Type`; body clearly a non-RDF/XML RDF syntax | parsed as sniffed; otherwise RDF/XML attempted | UR-RDF-03 | MAY/SHOULD |
| TC-RDF-04 | Ingest in syntax A, retrieve in syntax B (trio + JSON-LD) | graphs isomorphic up to blank-node labels (RDFC-1.0 in harness) | UR-RDF-04 | MUST |

---

## 9. E7 — Protocol correctness

| Test ID | Scenario | Expected | Trace | Strength |
|---------|----------|----------|-------|----------|
| TC-HTTP-01 | Parametrised over the §2 grid (method × condition) | each cell returns the mapped code | UR-HTTP-01 | MUST |
| TC-HTTP-02 | PUT/POST with media type the store can't parse | 415 | UR-HTTP-02 | MUST |
| TC-HTTP-03 | Unsupported verb / malformed request line | 405 | UR-HTTP-03 | MUST |
| TC-HTTP-04 | GET/HEAD response headers; then `If-None-Match` revalidation | strong `ETag` + `Vary: Accept`; matching revalidation → 304 | UR-HTTP-04 / UR-CC-01 | MUST |
| TC-HTTP-05 | OPTIONS on graph and on store | 200/204 + `Allow`; with PATCH on, `Accept-Patch: application/sparql-update` | UR-HTTP-05 (OQ-09/10) | MUST |

---

## 10. E8 — Security · E9 — Serialization · E10 — PATCH · E11 — Concurrency

### E8 — Security

| Test ID | Scenario | Expected | Trace | Strength |
|---------|----------|----------|-------|----------|
| TC-SEC-01 | Unauthenticated mutate on protected content | 401 | UR-SEC-01 | MAY |
| TC-SEC-02 | Authenticated but policy-denied | 403 | UR-SEC-02 | SHOULD |
| TC-SEC-03 | Swap auth scheme via config | enforcement point still emits 401/403; core behaviour unchanged | UR-SEC-03 (OQ-07) | MUST |

### E9 — Serialization & media-type coverage

| Test ID | Scenario | Expected | Trace | Strength |
|---------|----------|----------|-------|----------|
| TC-FMT-01 | Parse + serialize RDF/XML, Turtle, N-Triples | all succeed both directions | UR-FMT-01 | MUST |
| TC-FMT-02 | Negotiate JSON-LD, TriG, N-Quads | served on request | UR-FMT-02 | MUST |
| TC-FMT-03 | No `Accept` → trio fallback; unsupported `Accept` → 406 | as stated | UR-FMT-03 | MUST/SHOULD |
| TC-FMT-04 | Dataset payload's default graph → single-graph target | loaded into target | UR-FMT-04 | MUST |
| TC-FMT-05 | Dataset payload names a graph ≠ target | 400, no mutation | UR-FMT-04 (OQ-02a) | MUST |
| TC-FMT-06 | Dataset payload's named graph IRI == target | accepted | UR-FMT-04 | MUST |
| TC-FMT-07 | JSON-LD top-level `@graph` (no `@id`) → target; `@id`-scoped foreign graph | default→target; foreign → 400 | UR-FMT-04 (OQ-02b) | MUST |
| TC-FMT-08 | GET named graph G as TriG / N-Quads | labelled `GRAPH <G>` / 4th term = G; only G's triples | UR-FMT-05 | MUST |
| TC-FMT-09 | GET default graph as a quad syntax | emitted as dataset default (no label) | UR-FMT-05 | MUST |

### E10 — Incremental update (PATCH)

| Test ID | Scenario | Expected | Trace | Strength |
|---------|----------|----------|-------|----------|
| TC-PATCH-01 | PATCH `application/sparql-update` scoped to target | changes applied | UR-PATCH-01 | SHOULD |
| TC-PATCH-02 | Multi-op patch with a failing op | atomic: zero partial change | UR-PATCH-02 | MUST† |
| TC-PATCH-03 | Patch touching >1 / wrong graph | 422, no change | UR-PATCH-03 | SHOULD |
| TC-PATCH-04 | Malformed SPARQL Update body | 400 | UR-PATCH-05 | MUST† |
| TC-PATCH-05 | Unsupported patch media type | 415 + `Accept-Patch` | UR-PATCH-04/05 | MUST† |
| TC-PATCH-06 | Patch inapplicable to current state | 409 | UR-PATCH-05 | SHOULD |

† MUST *where PATCH is implemented* (RFC 5789/6585 obligations; non-waiverable per gate G8).

### E11 — Concurrency control & validators

| Test ID | Scenario | Expected | Trace | Strength |
|---------|----------|----------|-------|----------|
| TC-CC-01 | GET/HEAD on existing graph | strong `ETag` always present | UR-CC-01 | MUST |
| TC-CC-02 | Mutate, then re-read ETag; also a no-op write | ETag changes iff triples change | UR-CC-02 | MUST |
| TC-CC-03a | `If-None-Match` same state same format / same state different format | 304 / 200 (representation-sensitive) | UR-CC-03 | MUST |
| TC-CC-03b | Read as Turtle, PATCH `If-Match` with that ETag | precondition matches on state component | UR-CC-03 | MUST |
| TC-CC-04a | PATCH without `If-Match` | 428, no mutation | UR-CC-04 | MUST |
| TC-CC-04b | PATCH with stale `If-Match` | 412, no mutation | UR-CC-04 | MUST |
| TC-CC-04c | PATCH with current `If-Match` | success | UR-CC-04 | MUST |
| TC-CC-05 | Two racing conditional writers on one graph | exactly one 2xx, one 412 (atomic CAS) | UR-CC-05 | MUST |
| TC-CC-06 | PUT/DELETE with stale `If-Match`; and with none | 412 when stale; succeeds when absent (unconditional) | UR-CC-06 | SHOULD |
| TC-CC-07 | Two concurrent POST merges | both sets of triples present (commute) | UR-CC-07 | MUST |
| TC-CC-08 | High-concurrency write storm | revision increments exactly once per commit; no skipped/duplicated revisions | UR-CC-02/05 | MUST |

---

## 11. Non-functional verification

| Test ID | Scenario | Expected | Trace | Strength |
|---------|----------|----------|-------|----------|
| TC-NFR-01 | Mutation hits parse failure / policy refusal | stored content unchanged (all-or-nothing) | NFR-01 | MUST |
| TC-NFR-03 | Repeat identical PUT, then identical DELETE | idempotent (same end state); POST/PATCH not asserted idempotent | NFR-03 | MUST |
| TC-NFR-04 | PUT/POST a very large payload | bounded memory via streaming parse/serialize | NFR-04 | SHOULD |
| TC-NFR-05 | Any request | structured log with method, target IRI (direct/indirect), negotiated type, outcome | NFR-05 | SHOULD |
| TC-NFR-06 | Graph IRI with non-ASCII chars (percent-decoded) | correct end-to-end handling & round-trip | NFR-06 | MUST |
| TC-NFR-07 | Run W3C RDF/SPARQL GSP test suite | passes applicable cases | NFR-07 | SHOULD |
| TC-NFR-08 | Commit, restart process, re-read | graph state and revision counter survive | NFR-08 | MUST |

*(NFR-02 concurrency safety is exercised by TC-CC-05 / TC-CC-08.)*

---

## 12. Acceptance gates (phase exit)

Restates URD §10 and binds each gate to the test families that satisfy it. All gates must pass (or carry an approved waiver where the gate permits) to exit verification.

| Gate | Criterion | Satisfied by |
|------|-----------|--------------|
| **G1** | Every `MUST` / `MUST NOT` requirement has a passing automated test | all MUST-strength TCs across §3–§11 |
| **G2** | Every `SHOULD` is met or carries a recorded, approved waiver | all SHOULD-strength TCs + §14 waiver register |
| **G3** | Status-code matrix verified for each method × condition | TC-HTTP-01 (the §2 grid) |
| **G4** | Round-trip isomorphism across trio + JSON-LD; dataset round-trips preserve the single target graph | TC-RDF-04, TC-FMT-08/09 |
| **G5** | RDF-merge blank-node correctness under adversarial fixtures | TC-POST-02 |
| **G6** | Direct and indirect identification produce identical effects | TC-ID-06 |
| **G7** | Dataset-payload reconciliation: foreign-graph payload → 400, no mutation | TC-FMT-05, TC-FMT-07 |
| **G8** | If PATCH implemented: atomicity, scope-422, `Accept-Patch`, error mapping. RFC 5789/6585 MUSTs non-waiverable; PATCH SHOULDs waiverable | TC-PATCH-02..06, TC-CC-04a/b/c |
| **G9** | Concurrency control: ETag always present; PATCH 428/412 enforced; racing writers → one success + one 412; ETag correct across negotiated formats | TC-CC-01, TC-CC-03a/b, TC-CC-04a/b, TC-CC-05 |

---

## 13. MUST coverage check

Every `MUST`/`MUST NOT` requirement maps to at least one test (gate G1). Spot index of the load-bearing ones:

- UR-PUT-02 (no collateral targeting) → TC-PUT-02, reinforced by TC-FMT-05.
- UR-POST-01/02 (merge + blank nodes) → TC-POST-01, TC-POST-02.
- UR-RDF-02 (parse failure → 400) → TC-RDF-02, TC-PUT-06, TC-PATCH-04.
- UR-CC-04 (mandatory PATCH precondition) → TC-CC-04a/b/c.
- UR-CC-05 (atomic CAS) → TC-CC-05, TC-CC-08.
- UR-FMT-04 (dataset reconciliation) → TC-FMT-04/05/06/07.

GSP-§3 (broad "accept & handle") has no single test by design; it is exercised collectively wherever any method epic passes (mirrors the URD Appendix A.2 finding).

---

## 14. SHOULD waiver register

Empty at inception. Any SHOULD-strength test that will not pass at release is logged here with rationale and approver, per gate G2.

| Requirement | Test | Reason for waiver | Approver | Date |
|-------------|------|-------------------|----------|------|
| — | — | — | — | — |

---

## 15. Test fixtures required

- **Adversarial blank-node graphs** — shared and distinct bnode labels across existing graph and POST payload (TC-POST-02); deep bnode cycles for canonicalisation in the harness (TC-RDF-04).
- **Dataset payloads** — TriG/N-Quads/JSON-LD with: (a) default graph only, (b) named graph == target, (c) foreign named graph, (d) JSON-LD top-level `@graph` vs `@id`-scoped graph (TC-FMT-04..07).
- **Malformed payloads** — per-format syntax errors and zero-byte-as-RDF/XML (TC-RDF-02, TC-PUT-06); malformed SPARQL Update (TC-PATCH-04).
- **Validator/race fixtures** — captured ETags (current + stale), two concurrent writers, write storm (TC-CC-03/04/05/08).
- **Internationalisation** — non-ASCII IRIs requiring percent-decoding (TC-NFR-06).
- **Scale** — large multi-MB graph for streaming/memory bounds (TC-NFR-04).
- **Persistence** — restart harness asserting state + revision survival (TC-NFR-08).

*End of Test Matrix.*
