# SPARQL 1.2 Graph Store Protocol — Spec Ambiguities & Follow-up

#w3c #gsp #spec-feedback

|                        |                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------- |
| **Document type**      | Spec feedback / implementation report, for an external (W3C-facing) audience        |
| **Conformance source** | SPARQL 1.2 Graph Store Protocol — W3C Working Draft, 19 December 2024 ("the WD")    |
| **Companion docs**     | `SPARQL12-GSP-URD.md` (source of the 14 Open Questions this document reframes)      |
| **Audience**           | GSP spec editors, the SPARQL 1.2 Working Group, and other implementers of the WD    |

---

## 0. How to read this document

While building a conformant GSP server against the 19 December 2024 Working Draft, we hit 14 places where the spec text was genuinely ambiguous, silent, or under-specified relative to what a real implementation has to decide. Each is recorded internally as an Open Question (`OQ-01`–`OQ-14`) in our requirements document, with a resolution we adopted and the rationale behind it.

This document extracts and reframes those 14 questions for readers outside the project: what the spec doesn't say, the decision we made and why, and — where the gap looks like it would bite *any* implementer, not just us — a suggested direction for spec clarification.

**Framing note.** We believe this may be among the first implementations built directly against this WD revision, but we have no evidence anyone else has or hasn't done the same. Treat "AFAIK first implementation" as an observation about our own visibility, not a verified claim.

Each entry below uses the same shape:

- **What the spec doesn't say** — the gap, with the WD clause it's near.
- **Why it matters** — the concrete interoperability or correctness risk if two implementations resolve it differently.
- **Our resolution** — the decision we made and the reasoning.
- **Suggested clarification** — where applicable, wording or structure the WD could adopt to close the gap.

Section 2 leads with the four gaps most likely to matter to *other* implementers, not just this project. Section 3 covers the remaining ten, which are narrower or more deployment-specific. Section 4 is a full cross-reference table. Section 5 suggests how this could be raised with the Working Group.

---

## 1. How this came about

This project ran an AIDLC inception phase against the WD before writing any code. Inception's job is to turn spec text into atomic, testable requirements — which forces every ambiguity into the open, because "atomic and testable" is impossible to claim over a sentence with two readings. Section 11 of the URD ("Open questions for inception") is the record of that process: 14 questions raised, each resolved with a logged decision before implementation began.

That process was internal and pragmatic — the goal was an implementation, not a spec critique. This document is the separate step of asking, for each resolved question, "is this just our call, or is this a gap the WD itself should close?"

---

## 2. Priority findings

These four are prioritized because they affect protocol-level interoperability — two conformant implementations could each read the WD in good faith and produce incompatible behavior — rather than being purely internal design choices.

### F1 — Conformance scope is essentially undefined (OQ-01)

**What the spec doesn't say.** WD §7 ("Conformance") is a placeholder — it does not enumerate a conformance class, does not say which of the five core methods (`GET`/`HEAD`/`PUT`/`POST`/`DELETE`) an implementation must support to claim conformance, and does not distinguish "conformant" from "conformant subset." §3's "a compliant implementation MUST accept HTTP requests for the interaction defined by this document, and MUST handle them as specified" is the closest thing to a conformance statement, but it doesn't say what happens if a server only implements, say, `GET` and `PUT`.

**Why it matters.** Without a conformance class, "GSP-conformant" is not a falsifiable claim. Two servers could both call themselves conformant while one supports only read operations and the other supports the full method set — a client written against one may simply not work against the other, with no spec text either side is violating. This is the load-bearing gap: everything else in the WD assumes a conformance target that §7 never actually states (tracked internally as RISK-01, still open in our own risk register precisely because it depends on upstream spec text, not on anything we control).

**Our resolution.** We adopted the strictest reading available from context: all five core verbs MUST be implemented, every direct MUST/MUST NOT honored, every SHOULD honored or explicitly waived with a logged reason. `PATCH` (WD §5.7, Informative) stays optional, but its RFC 5789/6585 obligations become binding the moment it's offered. We treat each method-scoped "a request that uses METHOD MUST…" clause as conditional on that method being supported, and §3's blanket requirement as requiring broad method coverage rather than pick-and-choose.

**Suggested clarification.** WD §7 should define at least one named conformance class ("GSP Server," analogous to how other W3C protocol specs structure conformance) stating explicitly which methods are mandatory-to-implement versus optional, and what "conformant" means for a server that implements only a subset. Even a minimal statement — "a conformant GSP server MUST implement GET, PUT, POST, and DELETE; HEAD conformance follows from GET; PATCH is OPTIONAL" — would remove the single largest source of interop ambiguity in the document.

---

### F2 — Empty-graph semantics are undefined for named vs. default graphs (OQ-04, OQ-13)

**What the spec doesn't say.** WD §5.3 makes creating an *empty* graph optional ("for implementations that support empty graphs") but never defines what "empty" means as a matter of resource existence. It doesn't say whether a named graph that has been `PUT` with zero triples is a `200`-returning empty resource or a `404`-returning absent one, and it says nothing at all about whether the *default* graph — which always exists as a matter of RDF dataset structure — should be treated the same way as a named graph for this purpose.

**Why it matters.** This changes the observable status code for a common sequence: `PUT` an empty document to a graph, then `GET` it. An implementation that treats empty-as-existing returns `200` with an empty body; one that treats empty-as-absent returns `404`. Both are defensible readings of "optional," but a client can't tell which behavior to expect without probing the specific server, and the two behaviors aren't just cosmetically different — `404` on `GET` after a successful `PUT` looks like a bug to anyone unfamiliar with this specific interpretation.

**Our resolution.** We split the decision by graph type. Named graphs: empty = absent (a named graph exists iff it holds ≥ 1 triple); a `PUT`/`PATCH` that leaves a named graph with zero triples renders it absent, and subsequent `GET`/`HEAD`/`DELETE` return `404`. Default graph: exempt from this rule — it always exists per RDF dataset semantics and returns `200` with an empty serialization even when empty, since a graph store always has *a* default graph even if nothing has been written to it.

**Suggested clarification.** WD §5.3 (and the `GET` semantics in §5.2) should state explicitly whether the default graph and named graphs are subject to the same existence rule, and should define "empty graph" as either a first-class resource state or explicitly note that implementations MAY treat a zero-triple named graph as absent. The default graph's special status (it is not optional the way a named graph is) is worth calling out by name, since it's easy to read §5.3's "optional empty graph support" as applying uniformly to both.

---

### F3 — Concurrency control is entirely unspecified (OQ-11, OQ-11a, OQ-11c)

**What the spec doesn't say.** The WD does not mention `ETag`, `If-Match`, optimistic concurrency, or any mechanism for a client to detect or prevent a lost update. `PUT` and `DELETE` are described as unconditional operations; `PATCH` (§5.7, Informative) inherits RFC 5789's general PATCH semantics by reference but the WD adds nothing project-specific about how a GSP server should validate preconditions, construct a validator, or handle concurrent writers to the same graph.

**Why it matters.** This is the sharpest correctness gap in the WD, not just an interop one. A graph store is explicitly a mutable, shared resource — the entire point of `PUT`/`POST`/`PATCH` is concurrent multi-client mutation — yet the spec that defines those operations says nothing about what happens when two clients race. Without a mandated validator, any real deployment either invents its own scheme (fragmenting interop the same way F1 does) or ships with a silent lost-update hazard, which for `PATCH` in particular (partial, non-idempotent modification) is a correctness bug, not a style choice.

**Our resolution.** We made optimistic concurrency mandatory rather than advisory: `GET`/`HEAD` MUST return a strong `ETag`; `PATCH` MUST require `If-Match` (`428` if absent, `412` if the validator is stale, no mutation either way); `PUT`/`DELETE` honor conditional headers when present but aren't required to receive them, preserving the WD's unconditional-`PUT` framing. Because one graph state has multiple valid serializations, we made the `ETag` a composite of a state token (a monotonic per-graph revision counter, chosen over content-hashing to keep RDF canonicalization off the write path) and a representation discriminator, with `Vary: Accept`, and specified that `If-Match` compares only the state component — so a client that read a graph as Turtle can safely precondition a write without caring that another client wrote back N-Triples. Atomicity is enforced with a transaction-scoped advisory lock around read-verify-apply-increment.

**Suggested clarification.** This is the strongest candidate for actual spec-track work rather than just an editorial note. At minimum, the WD should note that concurrent modification is out of scope but *acknowledge* the hazard and point implementers at RFC 7232 (HTTP conditional requests) as the mechanism to use if they choose to address it — the current silence reads as "not considered" rather than "deliberately deferred." A stronger version would make `ETag` + conditional `PATCH` a SHOULD, given `PATCH` is explicitly non-idempotent and the lost-update scenario is not hypothetical.

---

### F4 — Dataset-payload reconciliation for quad formats is undefined (OQ-02, OQ-02a, OQ-02b)

**What the spec doesn't say.** GSP operations are single-graph by definition — `PUT`/`POST` target exactly one graph, identified by the request URI or `?graph=`/`?default`. But several RDF serializations the WD's own content-negotiation model can be extended to (TriG, N-Quads, JSON-LD with `@graph`) are *dataset* formats that can encode multiple named graphs in one document. The WD never says what a server should do when a client `PUT`s or `POST`s a multi-graph dataset document to a single-graph endpoint: reject it, take only the graph matching the target, silently union everything into the target, or something else.

**Why it matters.** This is a data-safety gap, not just a style one. A payload naming a graph other than the target could be silently written to the *wrong* graph, or silently dropped, depending on implementation choice — and because GSP's whole contract is "PUT/POST touch only the identified resource" (§5.3's MUST NOT collateral targeting), an implementation that unions everything into the target without checking is arguably violating that MUST NOT even though the WD text that would make the violation explicit doesn't exist for quad formats.

**Why it applies beyond this project.** Note that the WD only mandates the triple-format trio (RDF/XML, Turtle, N-Triples) — TriG, N-Quads, and JSON-LD dataset support are *not* required by the WD itself. We adopted them as a product-level requirement above the spec floor. This finding is therefore forward-looking: it matters to any implementer who chooses to extend beyond the mandatory trio into dataset formats, which we'd expect most production-grade implementations to do given how common these formats are.

**Our resolution.** Strict reconciliation: when a dataset payload is supplied to a single-graph `PUT`/`POST`, the triples written are exactly the payload's default graph unioned with the payload's named graph whose IRI equals the target (if present); any other named graph present in the payload — or *any* named graph at all when the target is the default graph — causes the server to reject the whole request with `400` and mutate nothing. JSON-LD follows the same rule: a top-level `@graph` with no surrounding `@id` maps to the target; an `@id`-scoped named graph is only accepted if its IRI equals the target.

**Suggested clarification.** If the Working Group intends dataset formats to remain out of the WD's mandatory scope, a short informative note pointing at this exact hazard would still help — "implementations that accept dataset-capable formats (TriG, N-Quads, JSON-LD) for single-graph operations need to define how out-of-target named graphs in the payload are handled; silently applying them to graphs other than the identified one would violate §5.3's collateral-targeting prohibition." That's enough to steer implementers away from the unsafe default (silent union) without expanding the WD's mandatory format set.

---

## 3. Additional findings

These are narrower gaps — deployment-specific choices, informative-section ambiguities, or ones a straightforward reading of the WD resolves without much room for divergence. Included for completeness and because a couple (OQ-08, OQ-12) still have a real, if smaller, interop edge.

### OQ-03 — Minted graph IRI shape on POST-to-store

**Gap.** WD §5.5 requires `POST` to the Graph Store URL (not a specific graph) to mint a new graph and return its IRI via `Location`, but says nothing about what that IRI should look like.

**Resolution.** Server-controlled, opaque UUID under the store namespace (`{store}/graphs/{uuid}`) — non-guessable, distinct from the request IRI.

**Spec relevance.** Low — this is a reasonable implementation-detail gap, not an interop hazard, since clients are expected to treat the minted IRI as opaque regardless.

### OQ-05 — Isolation level / atomicity mechanism for compare-and-swap

**Gap.** Not a spec gap so much as an internal implementation decision forced by F3 (concurrency control) once we'd committed to mandatory optimistic concurrency: what transaction isolation level and locking strategy actually deliver the atomicity NFR-02 requires.

**Resolution.** Postgres default (READ COMMITTED) plus an explicit transaction-scoped advisory lock keyed on the graph IRI; the lock, not the isolation level, is what serializes concurrent writers. Verified against the running implementation rather than assumed.

**Spec relevance.** None directly — this is downstream of F3, included here for traceability back to the URD's OQ numbering.

### OQ-06 — Default graph addressability

**Gap.** WD §4.2/§5 establish `?default` for indirect default-graph identification but leave open whether the default graph should *also* be reachable via a direct URI form.

**Resolution.** `?default` only — no direct URI form for the default graph.

**Spec relevance.** Low-medium. A server offering a direct URI for the default graph and one that doesn't are both plausible readings; worth a one-line clarification but not a correctness hazard since `?default` is unambiguous in both cases.

### OQ-07 — Authorization enforcement point and policy shape

**Gap.** WD §6 specifies that `401`/`403` are the correct statuses for auth failures but (correctly, per WD's own scope) says nothing about authentication scheme or authorization policy — that's explicitly a deployment concern.

**Resolution.** Pluggable enforcement point emitting `401`/`403` with a configurable scheme and a shipped default; policy is deployment config.

**Spec relevance.** None — this is properly out of scope for the WD and our resolution treats it that way.

### OQ-08 — Well-formed but unhostable indirect IRI

**Gap.** WD §4.2/§5.3/§6 don't distinguish between a `?graph=<iri>` that's merely absent (no content yet) and one the server refuses to host at all (e.g., outside an allowed namespace).

**Resolution.** `404` when the graph is merely absent; `403` when the store refuses the namespace on create.

**Spec relevance.** Medium — this distinction is genuinely useful for clients (retry-with-different-IRI vs. don't-bother), and other implementations enforcing namespace policies would hit the same fork. Worth a short clarifying note distinguishing "absent" from "refused."

### OQ-09 — Patch document language for v1

**Gap.** WD §5.7 (Informative) doesn't mandate a specific patch media type, leaving `Accept-Patch` discovery (RFC 5789) as the only defined mechanism for a client to learn what a server accepts.

**Resolution.** `application/sparql-update` only for v1, advertised via `Accept-Patch`; additional patch languages are a non-breaking future addition.

**Spec relevance.** Low — RFC 5789's `Accept-Patch` mechanism already covers this; the WD deferring to it rather than mandating one language is reasonable given PATCH's Informative status.

### OQ-10 — OPTIONS as a first-class capability-discovery method

**Gap.** WD doesn't discuss `OPTIONS` at all.

**Resolution.** Treated as first-class: returns `Allow`, and `Accept-Patch` when PATCH is enabled.

**Spec relevance.** Low-medium — since RFC 5789 already expects `Accept-Patch` discovery, and `OPTIONS`/`Allow` is standard HTTP, a one-line WD mention would remove any doubt that this applies to GSP resources specifically.

### OQ-12 — POST to a well-formed but absent named-graph IRI

**Gap.** WD §5.5 defines POST-to-store (mints a graph) and POST-to-existing-content (merges) but is silent on POST to a *named*, well-formed IRI that doesn't yet exist as content.

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
| F1 | Conformance scope undefined | OQ-01 | §7, §3 | **High** — foundational |
| F2 | Empty-graph existence undefined | OQ-04, OQ-13 | §5.3, §5.2 | **High** — visible status-code divergence |
| F3 | Concurrency control unspecified | OQ-11, OQ-11a, OQ-11c | (none — total silence), §5.7 | **High** — correctness, not just interop |
| F4 | Dataset-payload reconciliation undefined | OQ-02, OQ-02a, OQ-02b | §5.3, §5.5 | **High** — data-safety for extended formats |
| — | Minted graph IRI shape | OQ-03 | §5.5 | Low |
| — | Isolation level / CAS mechanism | OQ-05 | (implementation-internal) | None (downstream of F3) |
| — | Default graph addressability | OQ-06 | §4.2, §5 | Low–Medium |
| — | Auth enforcement point | OQ-07 | §6 | None (correctly out of WD scope) |
| — | Unhostable vs. absent indirect IRI | OQ-08 | §4.2, §5.3, §6 | Medium |
| — | Patch document language | OQ-09 | §5.7 | Low |
| — | OPTIONS as capability discovery | OQ-10 | (not discussed) | Low–Medium |
| — | POST to absent named-graph IRI | OQ-12 | §5.5 | Medium |
| — | PATCH precedence (404 vs. 428) | OQ-14 | (downstream of §5.7 silence) | None (downstream of F3) |

---

## 5. Suggested next steps

- **Before this goes anywhere near W3C:** Sean's review (per the tracking issue). This document makes external-facing claims about spec gaps and should be checked against the actual WD text section-by-section before circulation, not just against our internal URD's paraphrasing of it.
- If shared with the Working Group, F1 (conformance) and F3 (concurrency) are the two worth leading with — F1 because it's the one gap that undermines "conformant" as a meaningful claim at all, and F3 because it's the one with a real correctness (not just interop) consequence.
- This document reflects one implementation's resolutions, offered as evidence of where the WD text left room for divergent-but-reasonable choices — not as a claim that our resolutions are the only correct ones or that they should be adopted as-is.
