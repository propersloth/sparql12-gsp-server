# SPARQL 1.2 Graph Store Protocol — Spec Ambiguities & Follow-up

#normative #w3c #gsp #spec-feedback

|                        |                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------- |
| **Document type**      | Spec feedback / implementation report, for an external (W3C-facing) audience        |
| **Conformance source** | [SPARQL 1.2 Graph Store Protocol — W3C Working Draft, 19 December 2024](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/) ("the WD") |
| **Companion docs**     | `SPARQL12-GSP-URD.md` (source of the 14 Open Questions this document reframes). Draft W3C submission text built on these findings is tracked under issue [#54](https://github.com/propersloth/sparql12-gsp-server/issues/54) rather than kept as a repo doc — it's writing-prompt material for actual GitHub issues/comments, not itself a durable reference. |
| **Audience**           | GSP spec editors, the SPARQL 1.2 Working Group, and other implementers of the WD    |

---

## Reference Index

Every spec and RFC cited anywhere in this document, in one place.

| Source | Link | Cited for |
| :-- | :-- | :-- |
| SPARQL 1.2 Graph Store Protocol — pinned WD (19 Dec 2024) | [w3.org/TR/2024/WD-…-20241219](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/) | The conformance source for this whole document; every `§`-numbered link above points here |
| SPARQL 1.2 Graph Store Protocol — live editors' draft | [w3c.github.io/sparql-graph-store-protocol](https://w3c.github.io/sparql-graph-store-protocol/spec/) | Re-verification pass (§0) — confirms findings still hold against the in-progress text |
| SPARQL 1.2 Graph Store Protocol — latest published TR | [w3.org/TR/sparql12-graph-store-protocol](https://www.w3.org/TR/sparql12-graph-store-protocol/) | Current official version pointer |
| GSP spec repo | [github.com/w3c/sparql-graph-store-protocol](https://github.com/w3c/sparql-graph-store-protocol) | Where this feedback would ultimately be filed (issue #54) |
| RFC 5789 — PATCH Method for HTTP | [rfc-editor.org/rfc/rfc5789](https://www.rfc-editor.org/rfc/rfc5789.html) | F1, F3, OQ-09, OQ-10 — PATCH's own atomicity/`Accept-Patch` obligations |
| RFC 6585 — Additional HTTP Status Codes | [rfc-editor.org/rfc/rfc6585](https://www.rfc-editor.org/rfc/rfc6585.html) | F1 — `428 Precondition Required` |
| RFC 9110 §13 — HTTP Semantics, Conditional Requests | [rfc-editor.org/rfc/rfc9110#section-13](https://www.rfc-editor.org/rfc/rfc9110.html#section-13) | F3 — suggested clarification anchor; current HTTP semantics doc (obsoletes RFC 7232) |
| RDF 1.2 XML Syntax | [w3.org/TR/rdf12-xml](https://www.w3.org/TR/rdf12-xml/) | F4 — mandatory trio |
| RDF 1.2 Turtle | [w3.org/TR/rdf12-turtle](https://www.w3.org/TR/rdf12-turtle/) | F4 — mandatory trio |
| RDF 1.2 N-Triples | [w3.org/TR/rdf12-n-triples](https://www.w3.org/TR/rdf12-n-triples/) | F4 — mandatory trio |
| RDF 1.2 TriG | [w3.org/TR/rdf12-trig](https://www.w3.org/TR/rdf12-trig/) | F4 — dataset/quad format |
| RDF 1.2 N-Quads | [w3.org/TR/rdf12-n-quads](https://www.w3.org/TR/rdf12-n-quads/) | F4 — dataset/quad format |
| JSON-LD 1.1 | [w3.org/TR/json-ld11](https://www.w3.org/TR/json-ld11/) | F4 — dataset-capable JSON syntax, `@graph` |

*(RDF 1.2 links reflect what the live GSP draft's own inline citations now point at — `[[?RDF12-TURTLE]]` etc. — even though its formal references list is stale and still cites the RDF 1.1-era `RDF-MT`. Noted, not treated as an error worth its own finding.)*

---

## 0. How to read this document

While building a conformant GSP server against the 19 December 2024 Working Draft, we hit 14 places where the spec text was genuinely ambiguous, silent, or under-specified relative to what a real implementation has to decide. Each is recorded internally as an Open Question (`OQ-01`–`OQ-14`) in our requirements document, with a resolution we adopted and the rationale behind it.

This document extracts and reframes those 14 questions for readers outside the project: what the spec doesn't say, the decision we made and why, and a suggested direction for spec clarification where the gap looks like it would bite *any* implementer, not just us.

**Framing note.** We believe this may be among the first implementations built directly against this WD revision, but we have no evidence anyone else has or hasn't done the same. Treat "AFAIK first implementation" as an observation about our own visibility, not a verified claim.

Section 2's four priority findings each use the same shape: **Ambiguity** (the gap, with the WD clause it's near), **Impact** (the interoperability or correctness risk if two implementations resolve it differently), **Resolution** (the decision we made and the reasoning), and **Suggested Clarification** (wording or structure the WD could adopt to close the gap). Section 3's additional findings use a lighter three-part version of the same shape: **Gap**, **Resolution**, and **Spec relevance**.

Section 2 leads with the four gaps most likely to matter to *other* implementers, not just this project. Section 3 covers the remaining ten, which are narrower or more deployment-specific. Section 4 is a full cross-reference table. Section 5 suggests how this could be raised with the Working Group.

---

## 1. How this came about

This project ran an AIDLC inception phase against the WD before writing any code. Inception's job is to turn spec text into atomic, testable requirements which forces every ambiguity into the open, because "atomic and testable" is impossible to claim over a sentence with two readings. Section 11 of the URD ("Open questions for inception") is the record of that process: 14 questions raised, each resolved with a logged decision before implementation began.

That process was internal and pragmatic. The goal was an implementation, not a spec critique. This document is the separate step of asking, for each resolved question, "is this just our call, or is this a gap the WD itself should close?"

---

## 2. Priority findings

These four are prioritized because they affect protocol-level interoperability. Two conformant implementations could each read the WD in good faith and produce incompatible behavior rather than being purely internal design choices.

### F1 — Conformance scope is essentially undefined (OQ-01)

#### Ambiguity

WD [§7](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x7-conformance) ("Conformance") opens with boilerplate RFC 2119/8174 keyword language, but its substantive subsection, [§7.1 "Conformance"](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x7-1-conformance) (verified directly against both the pinned WD and the current editors' draft), is a heading with **no body text at all**, not even a placeholder note. It does not enumerate a conformance class, does not say which of the five core methods (`GET`/`HEAD`/`PUT`/`POST`/`DELETE`) an implementation must support to claim conformance, and does not distinguish "conformant" from "conformant subset." [§3](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x3-protocol-model)'s "a compliant implementation MUST accept HTTP requests for the interaction defined by this document, and MUST handle them as specified" is the closest thing to a conformance statement, but it doesn't say what happens if a server only implements, say, `GET` and `PUT`. (For what it's worth, [§11](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x11-privacy-considerations)/[§12](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x12-security-considerations)/[§13](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x13-internationalization-considerations) are literally the word "TODO", so the document is explicit about being unfinished; §7.1 just doesn't say so.)

#### Impact

Without a conformance class, "GSP-conformant" **is not a falsifiable claim**. Two servers could both call themselves conformant while one supports only read operations and the other supports the full method set. A client written against one may simply not work against the other, with no spec text either side is violating. This is the load-bearing gap: everything else in the WD assumes a conformance target that [§7](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x7-conformance) never actually states (tracked internally as RISK-01, still open in our own risk register precisely because it depends on upstream spec text, not on anything we control).

#### Resolution

We adopted the strictest reading available from context: all five core verbs MUST be implemented, every direct MUST/MUST NOT honored, every SHOULD honored or explicitly waived with a logged reason. `PATCH` (WD [§5.7](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-7-http-patch-informative), Informative) stays optional, but its [RFC 5789](https://www.rfc-editor.org/rfc/rfc5789.html)/[RFC 6585](https://www.rfc-editor.org/rfc/rfc6585.html) obligations become binding the moment it's offered. We treat each method-scoped "a request that uses METHOD MUST…" clause as conditional on that method being supported, and [§3](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x3-protocol-model)'s blanket requirement as requiring broad method coverage rather than pick-and-choose.

#### Suggested Clarification

WD [§7](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x7-conformance) should define at least one named conformance class ("GSP Server," analogous to how other W3C protocol specs structure conformance) stating explicitly which methods are mandatory-to-implement versus optional, and what "conformant" means for a server that implements only a subset. Even a minimal statement such as: "a conformant GSP server MUST implement GET, PUT, POST, and DELETE; HEAD conformance follows from GET; PATCH is OPTIONAL" would remove the single largest source of interoperability ambiguity in the document.

---

### F2 — Empty-graph semantics are undefined for named vs. default graphs (OQ-04, OQ-13)

#### Ambiguity

WD [§5.3](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-3-http-put) makes creating an *empty* graph optional ("for implementations that support empty graphs") but never defines what "empty" means as a matter of resource existence. It doesn't say whether a named graph that has been `PUT` with zero triples is a `200`-returning empty resource or a `404`-returning absent one, and it says nothing at all about whether the *default* graph, which always exists as a matter of RDF dataset structure, should be treated the same way as a named graph for this purpose.

#### Impact

This changes the observable status code for a common sequence: `PUT` an empty document to a graph, then `GET` it. An implementation that treats empty-as-existing returns `200` with an empty body; one that treats empty-as-absent returns `404`. Both are defensible readings of "optional," but a client can't tell which behavior to expect without probing the specific server, and the two behaviors aren't just cosmetically different : `404` on `GET` after a successful `PUT` looks like a bug to anyone unfamiliar with this specific interpretation.

#### Resolution

We split the decision by graph type. Named graphs: empty = absent (a named graph exists iff it holds ≥ 1 triple); a `PUT`/`PATCH` that leaves a named graph with zero triples renders it absent, and subsequent `GET`/`HEAD`/`DELETE` return `404`. Default graph: exempt from this rule. It always exists per RDF dataset semantics and returns `200` with an empty serialization even when empty, since a graph store always has *a* default graph even if nothing has been written to it.

#### Suggested clarification

WD [§5.3](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-3-http-put) (and the `GET` semantics in [§5.2](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-2-http-get)) should state explicitly whether the default graph and named graphs are subject to the same existence rule, and should define "empty graph" as either a first-class resource state or explicitly note that implementations MAY treat a zero-triple named graph as absent. The default graph's special status (it is not optional the way a named graph is) is worth calling out by name, since it's easy to read [§5.3](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-3-http-put)'s "optional empty graph support" as applying uniformly to both.

---

### F3 — Concurrency control is entirely unspecified (OQ-11, OQ-11a, OQ-11c)

#### Ambiguity

The WD does not mention `ETag`, `If-Match`, optimistic concurrency, or any mechanism for a client to detect or prevent a lost update. `PUT` and `DELETE` are described as unconditional operations; `PATCH` ([§5.7](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-7-http-patch-informative), Informative) inherits [RFC 5789](https://www.rfc-editor.org/rfc/rfc5789.html)'s general PATCH semantics by reference but the WD adds nothing project-specific about how a GSP server should validate preconditions, construct a validator, or handle concurrent writers to the same graph.

#### Impact

This is the sharpest correctness gap in the WD, not just an interop one. A graph store is explicitly a mutable, shared resource.  The entire point of `PUT`/`POST`/`PATCH` is concurrent multi-client mutation, yet the spec that defines those operations says nothing about what happens when two clients race. Without a mandated validator, any real deployment either invents its own scheme (fragmenting interop the same way F1 does) or ships with a silent lost-update hazard, which for `PATCH` in particular (partial, non-idempotent modification) is a correctness bug, not a style choice.

#### Resolution

We made optimistic concurrency mandatory rather than advisory: `GET`/`HEAD` MUST return a strong `ETag`; `PATCH` MUST require `If-Match` (`428` if absent, `412` if the validator is stale, no mutation either way); `PUT`/`DELETE` honor conditional headers when present but aren't required to receive them, preserving the WD's unconditional-`PUT` framing. Because one graph state has multiple valid serializations, we made the `ETag` a composite of a state token (a monotonic per-graph revision counter, chosen over content-hashing to keep RDF canonicalization off the write path) and a representation discriminator, with `Vary: Accept`, and specified that `If-Match` compares only the state component, so a client that read a graph as Turtle can safely precondition a write without caring that another client wrote back N-Triples. Atomicity is enforced with a transaction-scoped advisory lock around read-verify-apply-increment.

#### Suggested clarification

This is the strongest candidate for actual spec-track work rather than just an editorial note. At minimum, the WD should note that concurrent modification is out of scope but *acknowledge* the hazard and point implementers at [RFC 9110 §13](https://www.rfc-editor.org/rfc/rfc9110.html#section-13) (HTTP Conditional Requests. The current HTTP semantics document; it obsoletes the older RFC 7232) as the mechanism to use if they choose to address it.  The current silence reads as "not considered" rather than "deliberately deferred." A stronger version would make `ETag` + conditional `PATCH` a SHOULD, given `PATCH` is explicitly non-idempotent and the lost-update scenario is not hypothetical.

---

### F4 — Dataset-payload reconciliation for quad formats is undefined (OQ-02, OQ-02a, OQ-02b)

#### Ambiguity

GSP operations are single-graph by definition: `PUT`/`POST` target exactly one graph, identified by the request URI or `?graph=`/`?default`. But several RDF serializations the WD's own content-negotiation model can be extended to (TriG, N-Quads, JSON-LD with `@graph`) are *dataset* formats that can encode multiple named graphs in one document. The WD never says what a server should do when a client `PUT`s or `POST`s a multi-graph dataset document to a single-graph endpoint: reject it, take only the graph matching the target, silently union everything into the target, or something else.

#### Impact

This is a data-safety gap, not just a style one. A payload naming a graph other than the target could be silently written to the *wrong* graph, or silently dropped, depending on implementation choice, and because GSP's whole contract is "PUT/POST touch only the identified resource" ([§5.3](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-3-http-put)'s MUST NOT collateral targeting), an implementation that unions everything into the target without checking is arguably violating that MUST NOT even though the WD text that would make the violation explicit doesn't exist for quad formats.

#### Applicability

Note that the WD only mandates the triple-format trio ([RDF/XML](https://www.w3.org/TR/rdf12-xml/), [Turtle](https://www.w3.org/TR/rdf12-turtle/), [N-Triples](https://www.w3.org/TR/rdf12-n-triples/)) — [TriG](https://www.w3.org/TR/rdf12-trig/), [N-Quads](https://www.w3.org/TR/rdf12-n-quads/), and [JSON-LD](https://www.w3.org/TR/json-ld11/) dataset support are *not* required by the WD itself. We adopted them as a product-level requirement above the spec floor. This finding is therefore forward-looking: it matters to any implementer who chooses to extend beyond the mandatory trio into dataset formats, which we'd expect most production-grade implementations to do given how common these formats are.

#### Resolution

Strict reconciliation: when a dataset payload is supplied to a single-graph `PUT`/`POST`, the triples written are exactly the payload's default graph unioned with the payload's named graph whose IRI equals the target (if present); any other named graph present in the payload — or *any* named graph at all when the target is the default graph — causes the server to reject the whole request with `400` and mutate nothing. JSON-LD follows the same rule: a top-level `@graph` with no surrounding `@id` maps to the target; an `@id`-scoped named graph is only accepted if its IRI equals the target.

#### Suggested Clarification

If the Working Group intends dataset formats to remain out of the WD's mandatory scope, a short informative note pointing at this exact hazard would still help: 

> "implementations that accept dataset-capable formats (TriG, N-Quads, JSON-LD) for single-graph operations need to define how out-of-target named graphs in the payload are handled; silently applying them to graphs other than the identified one would violate [§5.3](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-3-http-put)'s collateral-targeting prohibition." 

That's enough to steer implementers away from the unsafe default (silent union) without expanding the WD's mandatory format set.

---

## 3. Additional findings

These are narrower gaps: deployment-specific choices, informative-section ambiguities, or ones a straightforward reading of the WD resolves without much room for divergence. Included for completeness and because a couple (OQ-08, OQ-12) still have a real, if smaller, interop edge.

### OQ-03 — Minted graph IRI shape on POST-to-store

**Gap.** WD [§5.5](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-5-http-post) requires `POST` to the Graph Store URL (not a specific graph) to mint a new graph and return its IRI via `Location`, but says nothing about what that IRI should look like.

**Resolution.** Server-controlled, opaque UUID under the store namespace (`{store}/graphs/{uuid}`) — non-guessable, distinct from the request IRI.

**Spec relevance.** Low — this is a reasonable implementation-detail gap, not an interop hazard, since clients are expected to treat the minted IRI as opaque regardless.

### OQ-05 — Isolation level / atomicity mechanism for compare-and-swap

**Gap.** Not a spec gap so much as an internal implementation decision forced by F3 (concurrency control) once we'd committed to mandatory optimistic concurrency: what transaction isolation level and locking strategy actually deliver the atomicity NFR-02 requires.

**Resolution.** Postgres default (READ COMMITTED) plus an explicit transaction-scoped advisory lock keyed on the graph IRI; the lock, not the isolation level, is what serializes concurrent writers. Verified against the running implementation rather than assumed.

**Spec relevance.** None directly. This is downstream of F3, included here for traceability back to the URD's OQ numbering.

### OQ-06 — Default graph addressability

**Gap.** WD [§4.2](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x4-2-indirect-graph-identification)/[§5](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-graph-management-operations) establish `?default` for indirect default-graph identification but leave open whether the default graph should *also* be reachable via a direct URI form.

**Resolution.** `?default` only . No direct URI form for the default graph.

**Spec relevance.** Low-medium. A server offering a direct URI for the default graph and one that doesn't are both plausible readings; worth a one-line clarification but not a correctness hazard since `?default` is unambiguous in both cases.

### OQ-07 — Authorization enforcement point and policy shape

**Gap.** WD [§6](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x6-security-considerations) specifies that `401`/`403` are the correct statuses for auth failures but (correctly, per WD's own scope) says nothing about authentication scheme or authorization policy — that's explicitly a deployment concern.

**Resolution.** Pluggable enforcement point emitting `401`/`403` with a configurable scheme and a shipped default; policy is deployment config.

**Spec relevance.** None. This is properly out of scope for the WD and our resolution treats it that way.

### OQ-08 — Well-formed but unhostable indirect IRI

**Gap.** WD [§4.2](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x4-2-indirect-graph-identification)/[§5.3](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-3-http-put)/[§6](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x6-security-considerations) don't distinguish between a `?graph=<iri>` that's merely absent (no content yet) and one the server refuses to host at all (e.g., outside an allowed namespace).

**Resolution.** `404` when the graph is merely absent; `403` when the store refuses the namespace on create.

**Spec relevance.** Medium. This distinction is genuinely useful for clients (retry-with-different-IRI vs. don't-bother), and other implementations enforcing namespace policies would hit the same fork. Worth a short clarifying note distinguishing "absent" from "refused."

### OQ-09 — Patch document language for v1

**Gap.** WD [§5.7](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-7-http-patch-informative) (Informative) doesn't mandate a specific patch media type, leaving `Accept-Patch` discovery ([RFC 5789](https://www.rfc-editor.org/rfc/rfc5789.html)) as the only defined mechanism for a client to learn what a server accepts.

**Resolution.** `application/sparql-update` only for v1, advertised via `Accept-Patch`; additional patch languages are a non-breaking future addition.

**Spec relevance.** Low — [RFC 5789](https://www.rfc-editor.org/rfc/rfc5789.html)'s `Accept-Patch` mechanism already covers this; the WD deferring to it rather than mandating one language is reasonable given PATCH's Informative status.

### OQ-10 — OPTIONS as a first-class capability-discovery method

**Gap.** WD doesn't discuss `OPTIONS` at all.

**Resolution.** Treated as first-class: returns `Allow`, and `Accept-Patch` when PATCH is enabled.

**Spec relevance.** Low-medium — since [RFC 5789](https://www.rfc-editor.org/rfc/rfc5789.html) already expects `Accept-Patch` discovery, and `OPTIONS`/`Allow` is standard HTTP, a one-line WD mention would remove any doubt that this applies to GSP resources specifically.

### OQ-12 — POST to a well-formed but absent named-graph IRI

**Gap.** WD [§5.5](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-5-http-post) defines POST-to-store (mints a graph) and POST-to-existing-content (merges) but is silent on POST to a *named*, well-formed IRI that doesn't yet exist as content.

**Resolution.** `404` — POST never creates a graph at a caller-chosen IRI; that's what `PUT` is for. POST-to-store is the only way to get a server-minted IRI.

**Spec relevance.** Medium — an implementation that instead treated this as "create at the named IRI" would conflict with `PUT`'s role and blur the two creation paths the WD does define distinctly (caller-named via PUT vs. server-minted via POST-to-store). Worth stating explicitly since it's a natural but incorrect generalization from POST-to-store's minting behavior.

### OQ-14 — PATCH precedence: existence check vs. precondition check

**Gap.** Downstream of F3 — once PATCH preconditions are mandatory, the WD doesn't (and can't, since it doesn't mandate preconditions at all) say whether a PATCH to a nonexistent graph should fail on "not found" or "precondition missing" first.

**Resolution.** Existence checked first: PATCH to an absent graph returns `404` before any `428`/`412` check, since no validator is obtainable for content that doesn't exist.

**Spec relevance.** None directly beyond F3 — included for completeness since it's a resolved OQ in the URD.

---

## 4. Cross-reference table

| # | Finding | URD ref(s) | WD clause(s) | Spec relevance |
| :-- | :-- | :-- | :-- | :-- |
| F1 | Conformance scope undefined | OQ-01 | [§7](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x7-conformance), [§3](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x3-protocol-model) | **High** — foundational |
| F2 | Empty-graph existence undefined | OQ-04, OQ-13 | [§5.3](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-3-http-put), [§5.2](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-2-http-get) | **High** — visible status-code divergence |
| F3 | Concurrency control unspecified | OQ-11, OQ-11a, OQ-11c | (none — total silence), [§5.7](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-7-http-patch-informative) | **High** — correctness, not just interop |
| F4 | Dataset-payload reconciliation undefined | OQ-02, OQ-02a, OQ-02b | [§5.3](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-3-http-put), [§5.5](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-5-http-post) | **High** — data-safety for extended formats |
| — | Minted graph IRI shape | OQ-03 | [§5.5](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-5-http-post) | Low |
| — | Isolation level / CAS mechanism | OQ-05 | (implementation-internal) | None (downstream of F3) |
| — | Default graph addressability | OQ-06 | [§4.2](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x4-2-indirect-graph-identification), [§5](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-graph-management-operations) | Low–Medium |
| — | Auth enforcement point | OQ-07 | [§6](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x6-security-considerations) | None (correctly out of WD scope) |
| — | Unhostable vs. absent indirect IRI | OQ-08 | [§4.2](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x4-2-indirect-graph-identification), [§5.3](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-3-http-put), [§6](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x6-security-considerations) | Medium |
| — | Patch document language | OQ-09 | [§5.7](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-7-http-patch-informative) | Low |
| — | OPTIONS as capability discovery | OQ-10 | (not discussed) | Low–Medium |
| — | POST to absent named-graph IRI | OQ-12 | [§5.5](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-5-http-post) | Medium |
| — | PATCH precedence (404 vs. 428) | OQ-14 | (downstream of [§5.7](https://www.w3.org/TR/2024/WD-sparql12-graph-store-protocol-20241219/#x5-7-http-patch-informative) silence) | None (downstream of F3) |

---

## 5. Suggested next steps

- **Before this goes anywhere near W3C:** Sean's review (per the tracking issue). Every clause citation in this document has now been checked directly against both the pinned 19 Dec 2024 WD and the live editors' draft (not just against our internal URD's paraphrasing of it) — see the Reference Index below for the verified sources. That verification pass is what sharpened the F1 finding (§7.1 is an empty heading, not merely "TODO" as the URD's shorthand had it) and surfaced two overlapping upstream GitHub issues (tracked in issue #54).
- If shared with the Working Group, F1 (conformance) and F3 (concurrency) are the two worth leading with — F1 because it's the one gap that undermines "conformant" as a meaningful claim at all, and F3 because it's the one with a real correctness (not just interop) consequence.
- This document reflects one implementation's resolutions, offered as evidence of where the WD text left room for divergent-but-reasonable choices — not as a claim that our resolutions are the only correct ones or that they should be adopted as-is.
