# Requirements Verification Questions

#normative #inception #analysis 

## SPARQL 1.2 Graph Store Protocol Server

| Field             | Value                                             |
| ----------------- | ------------------------------------------------- |
| **Document type** | AIDLC Requirements Verification — Inception Phase |
| **Status**        | Active                                            |
| **Source**        | URD-SPARQL12-GSP.md + User Decisions              |

---

## 1. Resolved Questions (From URD Analysis)

| Question ID | Topic | Resolution | Answer |
|-------------|-------|------------|--------|
| Q-01 | PATCH conformance level | PATCH as MUST (B) | All PATCH requirements mandatory for v1 |
| Q-02 | Revision counter approach | Advisory locks (B) | `pg_advisory_xact_lock()` for atomic CAS |
| Q-03 | RDF library selection | Deferred | To be determined in Application Design |
| Q-04 | Technology stack | Confirmed | NestJS + PostgreSQL |
| Q-05 | All OQ-01 to OQ-14 | Resolved | All decisions captured in URD §11 |

---

## 2. Pending Questions for Application Design

### 2.1 Graph Storage Model

**Decision:** **[B]** Normalized Triple Store

**Justification:** Future SPARQL Query endpoint planned. Normalized storage enables native SQL queries on triple patterns and better supports complex SPARQL operations.

**Options previously evaluated:**
- **[A]** One row per graph with JSONB — simpler for GSP-only, but limits future SPARQL capabilities
- **[B]** Normalized triples — selected ✓ (supports future SPARQL Query)
- **[C]** Hybrid — adds complexity without significant benefit for this use case
- **[D]** Defer — not selected

**Resolution documented in:** Application Design Document (Section 3.1)

---

### 2.2 Revision Counter Implementation

**Decision:** **[B]** Column in `graphs` table

**Justification:** Single-row atomicity preferred. Version fetched with graph metadata in same query. Simpler transaction logic with `SELECT FOR UPDATE` or advisory lock on same row. No version history required by URD.

**Options previously evaluated:**
- **[A]** Separate `graph_versions` table — more complex, requires multi-table transactions
- **[B]** Column in `graphs` table — selected ✓ (simpler, atomic)
- **[C]** PostgreSQL sequence — awkward for per-graph counters
- **[D]** In-memory only — violates NFR-08 (must survive restarts)

**Resolution documented in:** Application Design Document (Section 3.2)

---

### 2.3 RDF Library Integration

**Decision:** **[A]** Injectable RDF Service

**Justification:** NestJS dependency injection best practices. RDF parsing/serialization/merge operations encapsulated in injectable service. Enables easy mocking in tests and future library swaps.

**Options previously evaluated:**
- **[A]** Injectable RDF Service — selected ✓ (NestJS best practices, testable)
- **[B]** Repository pattern with adapter — adds abstraction, may be premature
- **[C]** Direct library calls — couples business logic to library
- **[D]** Defer — not selected

**Resolution documented in:** Application Design Document (Section 3.3)

---

### 2.4 Authentication Scheme

**Decision:** **[A+B]** Configurable JWT or API Key

**Justification:** Allow deployment flexibility. Both JWT (bearer tokens) and API Key (header-based) should be supported as configurable options. Pluggy architecture allows adding more schemes later.

**Options previously evaluated:**
- **[A]** Bearer token (JWT) — included in config
- **[B]** API Key in header — included in config
- **[C]** mTLS — future extension
- **[D]** No default — rejected (need shipped default)

**Resolution documented in:** Application Design Document (Section 3.4)

---

### 2.5 Logging Format

**Decision:** **[A+C]** JSON structured logs with OpenTelemetry integration

**Justification:** NestJS ecosystem best practices. Pino provides high-performance JSON logs; OpenTelemetry provides standardized instrumentation, tracing, and log correlation across services.

**Options previously evaluated:**
- **[A]** JSON structured logs (Pino) — selected ✓ (base format)
- **[B]** Plain text — rejected (not machine-parseable)
- **[C]** OpenTelemetry — selected ✓ (instrumentation, traces, logs integration)
- **[D]** Defer — rejected (observability required per NFR-05)

**Includes:** Pino JSON logs + OTel SDK for traces, metrics, and log forwarding

**Resolution documented in:** Application Design Document (Section 3.5)

---

### 2.6 Default Graph Behavior

**Decision:** **[A]** Persistent with configurable volatile option for dev/test

**Justification:** Production requires persistent default graph (NFR-08). Development/testing benefits from volatile in-memory option for faster iteration. Configuration toggle enables both use cases.

**Options previously evaluated:**
- **[A]** Persistent (PostgreSQL) — selected ✓ (production default)
- **[B]** Volatile (in-memory) — available as configurable option for dev/test
- **[C]** Persistent with special handling — unnecessary complexity
- **[D]** Defer — not selected

**Configuration:** `GSP_DEFAULT_GRAPH_PERSISTENT=true|false` (default: true)

**Resolution documented in:** Application Design Document (Section 3.6)

---

### 2.7 Large Payload Handling

**Decision:** **[A]** Streaming with backpressure; prefer streaming over blocking

**Justification:** Node.js streams enable memory-efficient processing of large RDF payloads. Backpressure prevents memory exhaustion. Streaming responses (GET output) also preferred over blocking where feasible.

**Options previously evaluated:**
- **[A]** Streaming parse with backpressure — selected ✓ (memory efficient)
- **[B]** Chunked transfer — adds complexity, temporary storage needed
- **[C]** In-memory with limits — blocks on large payloads, memory risk
- **[D]** Defer — rejected (NFR-04 requires streaming support)

**General principle:** Streaming responses preferred over blocking where feasible (GET, POST multipart)

**Resolution documented in:** Application Design Document (Section 3.7)

---

## 3. Response Format

Please answer each question with the option letter (A, B, C, or D).

For questions where multiple selections are acceptable, prefix with `[multi]` and list letters.

---

*Document tracks verification questions per AIDLC Inception Phase*
