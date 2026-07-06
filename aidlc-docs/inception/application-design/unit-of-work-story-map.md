# Unit of Work Story Map

#normative #inception #reference 
## SPARQL 1.2 Graph Store Protocol Server

---

## 1. Epic to Unit Mapping

| Epic    | Description                    | Primary Unit | Supporting Units    |
| ------- | ------------------------------ | ------------ | ------------------- |
| **E1**  | Graph Identification & Routing | UW-05        | UW-01, UW-02        |
| **E2**  | Retrieval (GET/HEAD)           | UW-05        | UW-02, UW-03        |
| **E3**  | Replacement (PUT)              | UW-05        | UW-02, UW-03, UW-04 |
| **E4**  | Merge & Creation (POST)        | UW-05        | UW-02, UW-03, UW-04 |
| **E5**  | Removal (DELETE)               | UW-05        | UW-03, UW-04        |
| **E6**  | RDF Processing                 | UW-02        | —                   |
| **E7**  | Protocol Correctness           | UW-06        | —                   |
| **E8**  | Security Hooks                 | UW-06        | —                   |
| **E9**  | Serialization Coverage         | UW-02        | —                   |
| **E10** | Incremental Update (PATCH)     | UW-05        | UW-02               |
| **E11** | Concurrency Control            | UW-04        | UW-03               |
| **NFR** | Non-Functional                 | UW-07        | UW-01, UW-08        |

---

## 2. Requirement Coverage by Unit

### UW-01: Foundation
| Requirement | Type |
|-------------|------|
| NFR-08 | Persistence |
| CON-02 | HTTP baseline |

### UW-02: RDF Service
| Requirement | Type |
|-------------|------|
| UR-RDF-01 | Parse per Content-Type |
| UR-RDF-02 | Parse failure → 400 |
| UR-RDF-03 | Missing Content-Type |
| UR-RDF-04 | Round-trip integrity |
| UR-FMT-01 | Mandatory trio |
| UR-FMT-02 | Extended formats |
| UR-FMT-03 | Negotiation fallback |
| UR-FMT-04 | Dataset reconciliation (input) |
| UR-FMT-05 | Dataset serialization (output) |

### UW-03: Repositories
| Requirement | Type |
|-------------|------|
| NFR-02 | Concurrent mutation safety |
| NFR-08 | Persistence |

### UW-04: Concurrency
| Requirement | Type |
|-------------|------|
| UR-CC-01 | Mandatory ETag |
| UR-CC-02 | State-derived validator |
| UR-CC-03 | Composite ETag |
| UR-CC-04 | PATCH precondition |
| UR-CC-05 | Atomic CAS |
| UR-CC-06 | Conditional PUT/DELETE |
| UR-CC-07 | POST exemption |

### UW-05: Graph Store Service
| Requirement | Type |
|-------------|------|
| UR-ID-01 | Direct identification |
| UR-ID-02 | Indirect named-graph |
| UR-ID-03 | Indirect default-graph |
| UR-ID-04 | Absolute-IRI enforcement |
| UR-ID-05 | Unhostable IRI |
| UR-GET-01 | Retrieve serialization |
| UR-GET-02 | Default representation |
| UR-GET-03 | Content negotiation |
| UR-GET-04 | Unsupported → 406 |
| UR-GET-05 | httpRange-14 |
| UR-HEAD-01 | HEAD = GET |
| UR-PUT-01 | Replace content |
| UR-PUT-02 | No collateral |
| UR-PUT-03 | Create vs modify |
| UR-PUT-04 | Empty = absent |
| UR-POST-01 | RDF merge |
| UR-POST-02 | Blank node correctness |
| UR-POST-03 | Multipart merge |
| UR-POST-04 | Mint new graph |
| UR-POST-05 | Empty body |
| UR-POST-06 | Non-identifying target |
| UR-DEL-01 | Delete content |
| UR-DEL-02 | Delete absent → 404 |
| UR-DEL-03 | Override policy |
| UR-PATCH-01 | SPARQL Update |
| UR-PATCH-02 | Atomic application |
| UR-PATCH-03 | Single-graph scope |
| UR-PATCH-04 | Accept-Patch |
| UR-PATCH-05 | PATCH error mapping |
| UR-PATCH-06 | OPTIONS integration |

### UW-06: Controllers
| Requirement | Type |
|-------------|------|
| UR-HTTP-01 | Status-code discipline |
| UR-HTTP-02 | 415 unsupported media |
| UR-HTTP-03 | 405 method not allowed |
| UR-HTTP-04 | Conditional & caching |
| UR-HTTP-05 | OPTIONS capability |
| UR-SEC-01 | 401 challenge |
| UR-SEC-02 | 403 refusal |
| UR-SEC-03 | Pluggable enforcement |

### UW-07: Observability
| Requirement | Type |
|-------------|------|
| NFR-04 | Large payload (streaming) |
| NFR-05 | Structured logging |
| NFR-06 | IRI handling |

### UW-08: Integration Tests
| Requirement | Type |
|-------------|------|
| G1 | MUST tests |
| G2 | SHOULD coverage |
| G3 | Status matrix |
| G4 | Round-trip |
| G5 | Blank node merge |
| G6 | Direct/indirect |
| G7 | Dataset reconciliation |
| G8 | PATCH coverage |
| G9 | Concurrency tests |

---

## 3. Story Map by Epic

### E1: Graph Identification
```
[UW-01] Foundation
    └── [UW-05] Graph Store Service
              └── UR-ID-01 to UR-ID-05
```

### E2-E5: CRUD Operations
```
[UW-02] RDF Service (parse/serialize/merge)
    └── [UW-03] Repositories (CRUD)
              └── [UW-04] Concurrency (locks/ETags)
                        └── [UW-05] Graph Store Service
                                  └── GET, HEAD, PUT, POST, DELETE
```

### E6: RDF Processing
```
[UW-02] RDF Service
    └── UR-RDF-01 to UR-RDF-04, UR-FMT-01 to UR-FMT-05
```

### E7: Protocol Correctness
```
[UW-06] Controllers
    └── UR-HTTP-01 to UR-HTTP-05
```

### E8: Security
```
[UW-06] Controllers
    └── UR-SEC-01 to UR-SEC-03 (Auth guards)
```

### E10: PATCH
```
[UW-02] RDF Service (SPARQL Update parsing)
    └── [UW-05] Graph Store Service
              └── UR-PATCH-01 to UR-PATCH-06
```

### E11: Concurrency
```
[UW-03] Repositories (data layer)
    └── [UW-04] Concurrency Service
              └── UR-CC-01 to UR-CC-07
```

---

## 4. Risk-Based Unit Prioritization

| Risk | Mitigation Unit | Priority |
|------|-----------------|----------|
| RISK-02 (RDF Merge) | UW-02 | High |
| RISK-03 (Transcoding) | UW-02 | High |
| RISK-07 (PATCH lost updates) | UW-04 | High |
| RISK-08 (Validator) | UW-04 | High |
| RISK-05 (Routing) | UW-05 | Medium |
| RISK-01 (Conformance) | UW-08 | Medium |

---

*Story map per AIDLC Inception Phase*
