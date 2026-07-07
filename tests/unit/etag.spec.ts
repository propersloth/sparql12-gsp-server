// TEST MATRIX: TC-CC-01, TC-CC-02, TC-CC-03a, TC-CC-03b,
//              TC-CC-04a, TC-CC-04b, TC-CC-04c, TC-CC-06

import { ETagService, CANONICAL_MUTATION_FORMAT } from '../../src/graph-store/services/etag.service';
import { InvalidEtagException } from '../../src/graph-store/exceptions/invalid-etag.exception';

describe('ETagService', () => {
  let svc: ETagService;
  beforeEach(() => { svc = new ETagService(); });

  // ------------------------------------------------------------------ generate
  describe('generate (TC-CC-01)', () => {
    it('produces a quoted strong ETag with three dot-delimited components', () => {
      const e = svc.generate('abc', 7, 'text/turtle');
      expect(e).toMatch(/^"[^"]+\.\d+\.[^"]+"$/);
    });

    it('URL-encodes the mediaType component', () => {
      const e = svc.generate('abc', 1, 'application/ld+json');
      expect(e).toContain('application%2Fld%2Bjson');
    });

    it('does NOT have a W/ prefix (always strong)', () => {
      expect(svc.generate('abc', 1, 'text/turtle')).not.toContain('W/');
    });

    it('same inputs always produce the same ETag (deterministic)', () => {
      expect(svc.generate('g', 5, 'text/turtle')).toBe(svc.generate('g', 5, 'text/turtle'));
    });

    it('different mediaType → different ETag (TC-CC-03b)', () => {
      const t = svc.generate('g', 5, 'text/turtle');
      const j = svc.generate('g', 5, 'application/ld+json');
      expect(t).not.toBe(j);
    });

    it('different version → different ETag (TC-CC-02)', () => {
      expect(svc.generate('g', 1, 'text/turtle')).not.toBe(svc.generate('g', 2, 'text/turtle'));
    });
  });

  // ------------------------------------------------------------------ parse
  describe('parse', () => {
    it('round-trips generate → parse correctly', () => {
      const raw = svc.generate('uuid-abc', 42, 'application/ld+json');
      const p = svc.parse(raw);
      expect(p.graphId).toBe('uuid-abc');
      expect(p.version).toBe(42);
      expect(p.mediaType).toBe('application/ld+json');   // decoded
      expect(p.raw).toBe(raw);
    });

    it('throws InvalidEtagException when unquoted', () => {
      expect(() => svc.parse('g.1.turtle')).toThrow(InvalidEtagException);
    });

    it('throws InvalidEtagException when components < 3', () => {
      expect(() => svc.parse('"g.1"')).toThrow(InvalidEtagException);
    });

    it('throws InvalidEtagException when version is not numeric', () => {
      expect(() => svc.parse('"g.notanumber.turtle"')).toThrow(InvalidEtagException);
    });
  });

  // ------------------------------------------------------------------ compareStrong (reads / If-None-Match)
  describe('compareStrong — full ETag match (TC-CC-03a)', () => {
    it('returns true when graphId + version + mediaType all match', () => {
      const e = svc.generate('g', 3, 'text/turtle');
      expect(svc.compareStrong(e, 'g', 3, 'text/turtle')).toBe(true);
    });

    it('returns false when mediaType differs (same graph, same rev)', () => {
      // Client cached as Turtle; now requests JSON-LD — must NOT get 304.
      const e = svc.generate('g', 3, 'text/turtle');
      expect(svc.compareStrong(e, 'g', 3, 'application/ld+json')).toBe(false);
    });

    it('returns false when version differs', () => {
      const e = svc.generate('g', 3, 'text/turtle');
      expect(svc.compareStrong(e, 'g', 99, 'text/turtle')).toBe(false);
    });

    it('throws on malformed ETag', () => {
      expect(() => svc.compareStrong('bad', 'g', 1, 'text/turtle')).toThrow(InvalidEtagException);
    });
  });

  // ------------------------------------------------------------------ compareState (writes / If-Match)
  describe('compareState — graphId + version only (TC-CC-03b / TC-CC-04b / TC-CC-06)', () => {
    it('returns true when graphId + version match (mediaType irrelevant)', () => {
      // Client read as Turtle, now PATCHes — the format difference must not block it.
      const e = svc.generate('g', 5, 'text/turtle');
      expect(svc.compareState(e, 'g', 5)).toBe(true);
    });

    it('returns false when version differs (stale ETag → 412)', () => {
      const e = svc.generate('g', 5, 'text/turtle');
      expect(svc.compareState(e, 'g', 6)).toBe(false);
    });

    it('returns false when graphId differs (cross-graph false match closed)', () => {
      const e = svc.generate('different-graph', 5, 'text/turtle');
      expect(svc.compareState(e, 'g', 5)).toBe(false);
    });

    it('throws on malformed ETag', () => {
      expect(() => svc.compareState('"bad"', 'g', 1)).toThrow(InvalidEtagException);
    });
  });

  // ------------------------------------------------------------------ extractFirstEtag
  describe('extractFirstEtag', () => {
    it('extracts the first ETag from a comma-list', () => {
      expect(svc.extractFirstEtag('"g.1.t", "g.2.t"')).toBe('"g.1.t"');
    });

    it('returns * for wildcard', () => {
      expect(svc.extractFirstEtag('*')).toBe('*');
    });

    it('returns null for empty string', () => {
      expect(svc.extractFirstEtag('')).toBeNull();
    });

    it('does NOT accept a weak ETag (W/) for write preconditions — returns null', () => {
      // HTTP RFC 9110 §13.1.1: If-Match MUST use strong validators only.
      // The service strips weak ETags so callers treat them as absent.
      expect(svc.extractFirstEtag('W/"g.1.t"')).toBeNull();
    });
  });

  // ------------------------------------------------------------------ CANONICAL_MUTATION_FORMAT (v2, M3 fix)
  describe('CANONICAL_MUTATION_FORMAT', () => {
    it('is independently servable — a mutation-response ETag never references an unservable type', () => {
      // A mutation-response ETag's format component must be a value that could
      // legitimately appear as the `fmt` component of a GET-generated ETag.
      // text/turtle (the trio default) always qualifies, unlike a request-only
      // type such as application/sparql-update (which PATCH's Content-Type always is).
      const etag = svc.generate('graph-id', 5, CANONICAL_MUTATION_FORMAT);
      const parsed = svc.parse(etag);
      expect(parsed.mediaType).toBe('text/turtle');
    });
  });
});
