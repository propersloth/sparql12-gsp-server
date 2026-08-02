# W3C GSP Feedback — Draft Submissions

#w3c #gsp #spec-feedback #draft-not-sent

|                        |                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------- |
| **Document type**      | Ready-to-review draft copy for issue #54 — **nothing here has been sent anywhere**   |
| **Source material**    | `GSP-Spec-Ambiguities-and-Followup.md` (issue #53)                                  |
| **Target repo**        | `github.com/w3c/sparql-graph-store-protocol` (verified live, RDF-star WG)           |
| **Status**             | **Awaiting Sean's review and sign-off before anything is posted (issue #54 gate)**  |

---

## 0. What changed since issue #53's writeup

Before drafting, I re-verified the four priority findings against the **live editors' draft** (`https://w3c.github.io/sparql-graph-store-protocol/spec/`, fetched today) rather than relying solely on the pinned 19 Dec 2024 WD text, and checked the repo's existing issues. Two things materially change the plan:

1. **The Conformance section is emptier than "TODO."** In the current editors' draft, `#conformance` is a heading immediately followed by the SPARQL 1.1→1.2 changelog and the references list — there is no conformance-class text at all, not even a stub. This is *stronger* evidence for F1 than the URD's "§7 is TODO" framing.
2. **Two of our four priority findings already have active threads.** Issue [#24](https://github.com/w3c/sparql-graph-store-protocol/issues/24) ("Extend GSP to cover dataset/quad format documents") is a live, editor-engaged discussion covering exactly F4 — Andy Seaborne (Jena/Fuseki) and Gregory Williams (co-editor) are both active participants, and a contributor explicitly asked for implementers to "share the logic among implementations, whatever it might be." Issue [#26](https://github.com/w3c/sparql-graph-store-protocol/issues/26) touches `Accept`/`406` negotiation, adjacent to but not the same as F1.
3. **Also confirmed by direct text search of the live draft:** the words "quad" and "dataset" do not appear anywhere in the spec body; `ETag`/`If-Match`/`412`/`428` do not appear in any normative-requirement context (the one incidental "optimistic concurrency controls" mention is a passing example under DELETE, not a defined mechanism); RFC 5789 is only a bare inline link, never a cited reference; RFC 6585 and RFC 9110 aren't cited at all. This confirms F3 (concurrency control) is *total* silence, not partial.

**Net effect on the plan:** filing a new issue for F4 would duplicate an existing, editor-active thread — the higher-value move is a **comment** contributing our specific resolution as a data point. F1, F2, and F3 have no existing coverage and are drafted as new issues.

---

## 1. Venue strategy

| Finding | Venue | Why |
| :-- | :-- | :-- |
| **F4** — dataset/quad reconciliation | **Comment on existing issue #24** | Duplicating an active, editor-engaged thread would be poor form; a comment with our concrete resolution is exactly what the thread already asked for. |
| **F1** — conformance scope undefined | **New issue** | No existing coverage; foundational; now backed by a stronger evidence than issue #53's writeup used (empty section, not just "TODO"). |
| **F3** — concurrency control unspecified | **New issue** | No existing coverage; the only finding with a genuine *correctness* (not just interop) consequence — PATCH is explicitly non-idempotent per the spec's own PATCH section, so this isn't hypothetical. |
| **F2** — empty-graph existence semantics | **New issue** | No existing coverage; narrower than F1/F3 but concrete and cheap for the WG to resolve. |

**Why GitHub issues over a PR or the mailing list, for a first move:**
- The issue tracker is visibly where the editors actually work — #24 and #26 both have direct editor participation within days of filing. That's a faster, more targeted signal than `public-rdf-comments@w3.org`.
- `CONTRIBUTING.md` requires that "substantive contributions" (which a PR proposing normative text would be) come with either WG participation or a non-member patent licensing commitment. Issues carry no such requirement and match the observed norm — every open issue in this repo is a question/proposal, not spec-text PRs.
- A PR remains the natural *second* move once the WG has weighed in on direction — premature to draft specific replacement text before knowing whether the WG agrees a gap exists.

**Recommended order:** the #24 comment first (lowest friction, plugs into a conversation already in motion), then the three new issues, spaced out rather than filed as a block dump — reads better as ongoing engagement than a mass drop.

---

## 2. Draft — Comment on issue #24 (F4: dataset/quad reconciliation)

> Posts as a comment, not a new issue. Ready to paste as-is; only the implementer self-identification in the first line is a placeholder for Sean to fill in or drop.

<details>
<summary>Draft text</summary>

---

Implementing this WD independently[^impl-note], I hit the same fork the thread has already mapped out — merge everything, silently ignore out-of-target graphs, or reject — and wanted to share where I landed, per @lisp's point above about sharing the logic across implementations.

One thing that pushed the decision for me: §5.3/§5.5's "MUST NOT apply the payload to any resource other than the identified graph content" is written for triple payloads, but I don't see anything that scopes it *away* from quad payloads. Read literally, that MUST NOT already rules out "merge everything" as an option the moment a dataset payload carries a named graph other than the target — that's a write to a resource other than the identified one, full stop, regardless of what format smuggled it in.

That left two GSP-consistent options: silently drop the out-of-target triples, or reject the whole request. I went with **reject**: if a `PUT`/`POST` payload (TriG, N-Quads, or JSON-LD with `@id`-scoped named graphs) contains any named graph other than the target — or *any* named graph at all when the target is the default graph — the server returns `400` and mutates nothing. Accepted content is exactly the payload's default graph unioned with the payload's named graph matching the target IRI, if present. JSON-LD's top-level `@graph` (no surrounding `@id`) is treated as the document's default graph and maps to the target the same way.

Reasoning for reject-over-silently-drop: "drop the parts you didn't ask for" is a substantive, silent change to what the client thought it was sending, and GSP already treats parse failures and scope violations as hard errors elsewhere (`400` on unparseable payloads) — silently dropping content felt like the same failure mode as a partial-application bug, just at the payload-parsing layer instead of the write layer.

Happy to be told this is wrong or that other implementations have a good reason for the merge/ignore approaches instead — mostly wanted this on the record as a third data point.

[^impl-note]: *(Sean: fill in framing here — e.g. "as part of building a GSP server against this WD," with or without a repo link, whatever you're comfortable attaching your name to publicly. Keep it to one clause; the thread doesn't need our project pitch, just enough to establish this is real implementation experience.)*

---

</details>

---

## 3. Draft — New issue (F1: conformance scope)

<details>
<summary>Draft title</summary>

`Conformance section doesn't define what "conformant" means for partial implementations`

</details>

<details>
<summary>Draft body</summary>

---

In the current editors' draft, [§ Conformance](https://w3c.github.io/sparql-graph-store-protocol/spec/#conformance) contains only the SPARQL 1.1 → 1.2 changelog and the normative references list — there's no text defining a conformance class. Elsewhere the spec is written as a series of per-method obligations ("a request that uses the HTTP PUT method MUST…", "…using the HTTP DELETE method SHOULD…"), but nothing states which of the five methods (`GET`/`HEAD`/`PUT`/`POST`/`DELETE`) a server actually has to implement to call itself a conformant GSP server, or what "conformant" means for one that implements a subset.

This isn't purely academic — it's the one gap that everything else in the spec implicitly assumes an answer to. A server that implements only `GET`/`PUT` and one that implements all five methods can both plausibly claim "GSP conformant" today, and a client has no spec-guaranteed way to know which it's talking to short of probing it. `PATCH` is explicitly informative (§ HTTP PATCH), so its optionality is clear by contrast — which makes the silence on the five core methods more noticeable, not less.

Implementing against this WD, I read the combination of the general "a compliant implementation MUST accept HTTP requests… and handle them as specified" language with the per-method MUST clauses as implying all five core methods are mandatory-to-implement, with PATCH staying optional. That's a reasonable inference, but it *is* an inference — not something a conformance test could currently point at.

Would the WG consider adding a short, explicit conformance class to this section — even one sentence naming the mandatory-to-implement method set — so "conformant" becomes a checkable claim rather than an inference? Happy to help draft candidate text if that'd be useful.

---

</details>

---

## 4. Draft — New issue (F3: concurrency control unspecified)

<details>
<summary>Draft title</summary>

`No mechanism defined for detecting or preventing lost updates on concurrent writes`

</details>

<details>
<summary>Draft body</summary>

---

The Graph Store this protocol manages is defined (via [SPARQL Update](https://www.w3.org/TR/sparql12-update/#def_graphstore)) as "a mutable container of RDF graphs" — explicitly shared, mutable state. But nothing in the GSP spec addresses what happens when two clients write to the same graph concurrently. There's no `ETag`, `If-Match`, or precondition semantics defined anywhere for `PUT`, `POST`, or `PATCH`. The only mention of concurrency at all is a passing example under `DELETE`'s override clause ("An example of when the method may be overridden is in a content management system with optimistic concurrency controls") — which shows the concept was on someone's mind, but it's never turned into a defined mechanism. `ETag` itself only appears once, in the RFC 2616 caching-staleness discussion, not as a write-precondition validator.

This matters most for `PATCH`: the spec's own §HTTP PATCH (Informative) is explicit that "the enclosed entity contains a set of instructions describing how the RDF graph content… should be modified" — i.e. PATCH is a delta, not a replacement, and is neither safe nor idempotent per RFC 5789. Without a mandated precondition, a lost update on `PATCH` isn't a hypothetical edge case, it's the default outcome of two clients racing. `PUT` is less exposed (it's a full replacement, so a lost update is at least *visible* as "my write got clobbered" rather than silently merged wrong), but is equally undefined.

Implementing against this WD, I made optimistic concurrency mandatory rather than advisory: a strong `ETag` on every `GET`/`HEAD`, and a required `If-Match` on `PATCH` (`428` if absent, `412` if stale, no mutation either way — using [RFC 6585](https://www.rfc-editor.org/rfc/rfc6585.html)'s `428 Precondition Required` and [RFC 9110 §13](https://www.rfc-editor.org/rfc/rfc9110.html#section-13)'s conditional-request machinery, since RFC 9110 is the current HTTP semantics document [RFC 2616](https://www.rfc-editor.org/rfc/rfc2616.html) predates). Because one graph state has multiple valid serializations, the validator composes a state token with a representation discriminator so conditional reads and conditional writes can each compare the right component.

I'm not proposing the WD adopt mandatory preconditions wholesale — that's a real scope expansion and there may be good reasons to leave it to implementations. But even a short informative note acknowledging the hazard and pointing at RFC 9110 §13 as the mechanism to reach for would close the "was this considered and deliberately left out, or just not considered" ambiguity, which right now reads as the latter.

---

</details>

---

## 5. Draft — New issue (F2: empty-graph existence semantics)

<details>
<summary>Draft title</summary>

`Existence semantics of a zero-triple named graph (and default-graph status) undefined`

</details>

<details>
<summary>Draft body</summary>

---

§ HTTP PUT says: "For implementations that support empty graphs, if the request body is empty and there is sufficient authorization to create a new named graph using the IRI used in the request IRI, then an empty graph would need to be created." This makes empty-graph support explicitly optional, but doesn't say what happens on the other side of that choice: for an implementation that does *not* treat a zero-triple named graph as existing, should a subsequent `GET`/`HEAD`/`DELETE` on that IRI return `404` (never existed, or existence lapsed when the last triple did), or `200`/`204` (it was addressed by a successful `PUT`, so it exists, just with no content)? Both are defensible readings of "doesn't support empty graphs," and they produce different, client-visible status codes for the same request sequence: `PUT` (empty body) → `GET`.

Separately, the default graph's status isn't addressed at all here. SPARQL Update's Graph Store definition says the default graph occupies "one unnamed (default) slot" that's always present — which would suggest the default graph shouldn't be subject to the same existence ambiguity a named graph is, since it can't be "not yet created." But GSP's own text doesn't say this explicitly, so an implementation could plausibly (if a little perversely) 404 a `GET ?default` on a store that's never been written to, reading the empty-graph optionality as applying uniformly.

Implementing against this WD, I resolved both: a named graph exists iff it holds ≥ 1 triple (so an empty `PUT` result renders it absent, `404` on subsequent reads); the default graph is exempt and always returns `200` even when empty, since it's not optional the way a named graph's existence is.

Would the WG consider stating explicitly (a) whether a zero-triple named graph should read as absent or present for implementations that don't support empty graphs, and (b) that the default graph, per its Graph Store definition, is exempt from that ambiguity? Both seem like small, low-controversy clarifications relative to the interop confusion the current silence causes.

---

</details>

---

## 6. Before any of this gets posted

- [ ] Sean reviews all five pieces (one comment + four issue drafts) for tone, accuracy, and anything he'd rather not put his name on publicly.
- [ ] Fill in the `[^impl-note]` placeholder in the #24 comment draft — the only spot requiring a decision about how (or whether) to self-identify as an implementer.
- [ ] Confirm posting order and pacing (recommended: #24 comment first, then the three new issues spaced out rather than dropped at once).
- [ ] Once anything is actually posted, log the URL + date back on issue #54 per its tracking checkbox — this file stays draft-only until then.
