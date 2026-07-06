# Risk Assessment Report

#informative #inception #analysis

## SPARQL 1.2 Graph Store Protocol Server

| Field             | Value                                   |
| ----------------- | --------------------------------------- |
| **Document type** | AIDLC Risk Assessment — Inception Phase |
| **Status**        | Draft                                   |
| **Source**        | URD-SPARQL12-GSP.md Risk Analysis       |

---

## 1. Risk Summary

| Risk ID | Title                             | Severity | Likelihood | Status    |
| ------- | --------------------------------- | -------- | ---------- | --------- |
| RISK-01 | Under-specified conformance       | High     | Medium     | Open      |
| RISK-02 | RDF-merge blank node corruption   | Critical | Medium     | Mitigated |
| RISK-03 | Transcoding fidelity loss         | High     | Low        | Mitigated |
| RISK-04 | HTTP spec aging                   | Low      | Low        | Mitigated |
| RISK-05 | Indirect identification routing   | Medium   | Medium     | Open      |
| RISK-06 | Dataset semantic mismatch         | Medium   | Low        | Mitigated |
| RISK-07 | PATCH lost updates                | Critical | Medium     | Mitigated |
| RISK-08 | Validator/negotiation correctness | High     | Medium     | Mitigated |
| RISK-09 | Canonicalization cost             | Medium   | Low        | Closed    |

---

## 2. Risk Details

### RISK-01: Under-specified Conformance

**Severity:** High
**Likelihood:** Medium
**Status:** Open

**Description:**
GSP §7/§11/§12 are TODO in the WD (19 Dec 2024). "Strict requirements" are assembled from scattered clauses and may shift in later drafts.

**Impact:**
- Specification changes could require implementation changes
- Test suite may not be available or stable

**Mitigation:**
1. Pin to 19 Dec 2024 WD as baseline
2. Isolate spec-version assumptions in configuration
3. Monitor W3C SPARQL WG for updates
4. Version the specification compliance level

**Residual Risk:**
Implementation may drift from future spec versions.

---

### RISK-02: RDF-Merge Blank Node Corruption

**Severity:** Critical
**Likelihood:** Medium
**Status:** ✅ Mitigated

**Description:**
Naïve union of RDF graphs mishandles blank nodes and can silently corrupt data by incorrectly identifying blank nodes from different graphs.

**Mitigation (Implemented):**
- UR-POST-02 mandates RDF-merge semantics (blank node standardization)
- N3.js implements proper RDF merge with fresh blank node generation
- UW-02 unit tests include adversarial blank node fixtures
- G5 acceptance criterion requires blank node merge verification

**Verification:**
```typescript
// RdfService.merge() must use blank node mapper
const mapper = new BlankNodeMapper();
const renamed = this.renameBlankNodes(incoming, mapper);
return union(existing, renamed);
```

---

### RISK-03: Transcoding Fidelity Loss

**Severity:** High
**Likelihood:** Low
**Status:** ✅ Mitigated

**Description:**
Lossy conversion across RDF syntaxes can break UR-RDF-04 (round-trip integrity) through:
- Datatype handling differences
- Language tag normalization
- Base IRI resolution
- Relative IRI handling

**Mitigation (Implemented):**
- UR-RDF-04 mandates model-level (not text-level) conversion
- N3.js operates on DatasetCore (abstract RDF model)
- G4 acceptance criterion requires round-trip isomorphism tests
- Test suite includes all 6 supported formats

**Verification:**
```
Graph A (Turtle) → Parse → DatasetCore → Serialize (JSON-LD) → Parse → DatasetCore → Isomorphic(A)?
```

---

### RISK-04: HTTP Specification Aging

**Severity:** Low
**Likelihood:** Low
**Status:** ✅ Mitigated

**Description:**
GSP spec cites RFC 2616 (obsolete); modern stacks implement RFC 9110 semantics.

**Mitigation (Implemented):**
- ASM-03: Follow RFC 9110 where 2616 is obsolete
- RFC 9110 is backward-compatible with GSP intent
- HTTP semantics documented in requirements

---

### RISK-05: Indirect Identification Routing

**Severity:** Medium
**Likelihood:** Medium
**Status:** Open

**Description:**
Query-component routing can collide with framework conventions and percent-encoding edge cases:
- `?graph=` may conflict with query param parsing
- Percent-encoded IRIs may double-decode
- Empty vs missing `graph` param ambiguity

**Mitigation (Implemented):**
- UR-ID-04: Explicit absolute-IRI validation
- GraphRoutingService handles decoding explicitly
- UW-05 unit tests cover edge cases

**Residual Risk:**
Framework-specific routing may need configuration.

---

### RISK-06: Dataset Semantic Mismatch

**Severity:** Medium
**Likelihood:** Low
**Status:** ✅ Mitigated

**Description:**
Dataset syntaxes (TriG, N-Quads, JSON-LD) can smuggle triples into non-target graphs silently.

**Mitigation (Implemented):**
- UR-FMT-04 mandates strict reconciliation
- Payload naming non-target graph → 400 + no mutation
- OQ-02a decision documented
- G7 acceptance criterion tests dataset rejection

**Verification:**
```
PUT /graph/http://ex.org/g with TriG containing <http://other.org/g> { ... }
→ 400 Bad Request
→ No mutation
```

---

### RISK-07: PATCH Lost Updates

**Severity:** Critical
**Likelihood:** Medium
**Status:** ✅ Mitigated

**Description:**
Non-atomic or unconditional PATCH can:
- Corrupt graph with partial application
- Overwrite concurrent changes (lost update)

**Mitigation (Implemented):**
- UR-PATCH-02: Atomic application (RFC 5789 MUST)
- UR-CC-04: Mandatory If-Match with 428/412
- UR-CC-05: Advisory lock + atomic compare-and-swap
- G9 acceptance criterion tests racing writers

**Implementation:**
```typescript
// All PATCH operations inside advisory lock
await withAdvisoryLock(graphId, async () => {
  const graph = await findById(graphId);
  if (!matchesPrecondition(ifMatch, graph.version)) {
    throw new PreconditionFailedException();
  }
  const result = applyPatch(graph, patch);
  await save(result);  // Transaction commits here
});
```

---

### RISK-08: Validator/Negotiation Correctness

**Severity:** High
**Likelihood:** Medium
**Status:** ✅ Mitigated

**Description:**
- State-only ETag breaks conditional GET across serializations
- Representation-only ETag cannot anchor write precondition

**Mitigation (Implemented):**
- UR-CC-03: Composite ETag `"{graphId}.{rev}.{fmt}"`
- `Vary: Accept` on all negotiated responses
- Reads compare full ETag; writes compare revision only
- G9 acceptance criterion tests ETag behavior

**ETag Format:**
```
"a1b2c3d4.42.turtle"
   │        │     │
   │        │     └── Negotiated media type
   │        └── Monotonic revision counter
   └── Graph UUID
```

---

### RISK-09: Canonicalization Cost

**Severity:** Medium
**Likelihood:** Low
**Status:** ✅ Closed

**Description:**
Computing content-hash ETag requires RDF canonicalization (RDFC-1.0), which is expensive on every write.

**Resolution (OQ-11a):**
- Content-hash rejected for v1
- Revision counter avoids per-write canonicalization
- Canonicalization confined to test harness (UR-RDF-04)
- Off the hot path

---

## 3. Risk by Unit

| Unit | Risks Addressed | Mitigation |
|------|----------------|------------|
| UW-01 | RISK-04 | HTTP 9110 compliance |
| UW-02 | RISK-02, RISK-03, RISK-09 | RDF merge, transcoding, no canonicalization |
| UW-03 | RISK-01 | Spec pinning |
| UW-04 | RISK-07, RISK-08 | Advisory locks, composite ETag |
| UW-05 | RISK-05 | Explicit routing + validation |
| UW-06 | RISK-01 | Status code discipline |
| UW-08 | All | Comprehensive test coverage |

---

## 4. Risk Matrix

```
Likelihood →
          Low        Medium       High
Severity
  Low   │ RISK-04  │           │
        │ RISK-03  │           │
        └──────────┴───────────┴────
  Medium│ RISK-09  │ RISK-01   │
        │ RISK-06  │ RISK-05   │
        └──────────┴───────────┴────
  High  │ RISK-03  │ RISK-01   │ RISK-07
        │          │ RISK-05   │ RISK-08
        └──────────┴───────────┴────

Legend:
🟢 Closed (RISK-09)
✅ Mitigated (RISK-02, RISK-03, RISK-04, RISK-06, RISK-07, RISK-08)
⚠️ Open (RISK-01, RISK-05)
```

---

## 5. Risk Acceptance Criteria

| Risk | Acceptable If | Unacceptable If |
|------|---------------|----------------|
| RISK-01 | Spec changes tracked, versioned | Breaking changes without notice |
| RISK-05 | Edge cases documented, tested | Framework conflicts cause 500s |
| All others | Mitigations verified by UW-08 | Tests fail, production corruption |

---

## 6. Monitoring Recommendations

| Risk | Monitor | Alert Threshold |
|------|---------|-----------------|
| RISK-01 | W3C SPARQL WG updates | New WD release |
| RISK-02 | Blank node corruption in logs | Any occurrence |
| RISK-05 | Routing errors (4xx spike) | >1% of requests |
| RISK-07 | 412 Precondition Failed | >10% of PATCH |
| RISK-08 | ETag mismatch errors | Any occurrence |

---

## 7. Contingency Plans

| Risk | Contingency |
|------|-------------|
| RISK-01 (Spec change) | Version-gate implementation; deploy new version |
| RISK-05 (Routing collision) | Configurable route prefix; documentation |
| RISK-07 (Lost update detected) | Audit log review; manual reconciliation |

---

## 8. Risk Owner Assignment

| Risk | Owner | Review Frequency |
|------|-------|-------------------|
| RISK-01 | Technical Lead | Monthly |
| RISK-05 | Backend Developer (UW-05) | Per sprint |
| RISK-02, RISK-03 | RDF Developer (UW-02) | Per sprint |
| RISK-07, RISK-08 | Backend Developer (UW-04) | Per sprint |

---

*Risk assessment per AIDLC Inception Phase*
