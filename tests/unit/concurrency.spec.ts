// TEST MATRIX: TC-CC-04b, TC-CC-05, TC-CC-06, TC-CC-07

import { ConcurrencyService } from '../../src/graph-store/services/concurrency.service';
import { ETagService } from '../../src/graph-store/services/etag.service';
import { InvalidEtagException } from '../../src/graph-store/exceptions/invalid-etag.exception';

describe('ConcurrencyService', () => {
  let svc: ConcurrencyService;
  let etag: ETagService;   // used to build realistic fixtures

  beforeEach(() => {
    svc  = new ConcurrencyService();
    etag = new ETagService();
  });

  describe('hashGraphId', () => {
    it('is deterministic for the same input', () => {
      const id = '550e8400-e29b-41d4-a716-446655440000';
      expect(svc.hashGraphId(id)).toBe(svc.hashGraphId(id));
    });

    it('produces different hashes for different IDs', () => {
      expect(svc.hashGraphId('graph-a')).not.toBe(svc.hashGraphId('graph-b'));
    });

    it('produces a positive safe integer within 48-bit range (M-02 fix)', () => {
      const h = svc.hashGraphId('any-id');
      expect(Number.isSafeInteger(h)).toBe(true);
      expect(h).toBeGreaterThan(0);
      // Must fit in 48 bits (max 2^48 - 1 = 281474976710655)
      expect(h).toBeLessThanOrEqual(281474976710655);
    });
  });

  describe('lock', () => {
    it('issues SELECT pg_advisory_xact_lock on the provided manager', async () => {
      const mockMgr = { query: jest.fn().mockResolvedValue([]) } as any;
      await svc.lock(mockMgr, 'http://ex.org/g');
      expect(mockMgr.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock($1)',
        [svc.hashGraphId('http://ex.org/g')],
      );
    });

    it('passes the correct hash key (not the raw string)', async () => {
      const mockMgr = { query: jest.fn().mockResolvedValue([]) } as any;
      const iri = 'http://ex.org/g';
      await svc.lock(mockMgr, iri);
      const [, params] = mockMgr.query.mock.calls[0];
      expect(params[0]).toBe(svc.hashGraphId(iri));
    });

    it('CONTRACT (v3, M7): differently-cased spellings hash differently unless normalized by the caller', () => {
      // This is intentional and expected — hashGraphId does not normalize.
      // It is the CALLER'S responsibility (GSP-023/024, via GraphRoutingService.validateIri)
      // to normalize before calling lock(). This test documents that boundary so a future
      // change to hashGraphId doesn't accidentally "fix" this by adding normalization at
      // the wrong layer, and so a regression that skips normalization upstream shows up here
      // as a reminder of the contract rather than a mysterious concurrency bug in the field.
      expect(svc.hashGraphId('HTTP://ex.org/g')).not.toBe(svc.hashGraphId('http://ex.org/g'));
    });
  });

  describe('compareVersions (TC-CC-04b / TC-CC-06)', () => {
    // N-02 fix: build fixtures from ETagService.generate() so they use the real encoded format

    it('returns true when graphId AND version both match', () => {
      const e = etag.generate('abc123', 42, 'text/turtle');   // "abc123.42.text%2Fturtle"
      expect(svc.compareVersions(e, 'abc123', 42)).toBe(true);
    });

    it('returns false when version differs', () => {
      const e = etag.generate('abc123', 42, 'text/turtle');
      expect(svc.compareVersions(e, 'abc123', 99)).toBe(false);
    });

    it('returns false when graphId differs (cross-graph false-match closed)', () => {
      const e = etag.generate('other-graph', 42, 'text/turtle');
      expect(svc.compareVersions(e, 'abc123', 42)).toBe(false);
    });

    it('returns true when version and graphId match regardless of mediaType', () => {
      // write preconditions compare state only; format doesn't matter
      const turtleEtag  = etag.generate('abc123', 5, 'text/turtle');
      const jsonldEtag  = etag.generate('abc123', 5, 'application/ld+json');
      expect(svc.compareVersions(turtleEtag, 'abc123', 5)).toBe(true);
      expect(svc.compareVersions(jsonldEtag, 'abc123', 5)).toBe(true);
    });

    it('throws InvalidEtagException on unquoted input', () => {
      expect(() => svc.compareVersions('no-quotes', 'any', 0)).toThrow(InvalidEtagException);
    });

    it('throws InvalidEtagException on fewer than three components', () => {
      expect(() => svc.compareVersions('"only-two.parts"', 'any', 0)).toThrow(InvalidEtagException);
    });
  });

  describe('TC-CC-05: real concurrent serialization', () => {
    it('is verified end-to-end in tests/integration/compliance.spec.ts (TC-COMP-09)', () => {
      // Unit mocks cannot prove advisory-lock semantics across real DB connections.
      expect(true).toBe(true);
    });
  });
});
