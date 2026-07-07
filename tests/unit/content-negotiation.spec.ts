// TEST MATRIX: TC-GET-03, TC-GET-05, TC-FMT-03, TC-RDF-03
import { ContentNegotiationService } from '../../src/graph-store/services/content-negotiation.service';

describe('ContentNegotiationService', () => {
  let service: ContentNegotiationService;

  beforeEach(() => {
    service = new ContentNegotiationService();
  });

  describe('TC-GET-03: Default format fallback', () => {
    it('should use wildcard when no Accept header', () => {
      const parsed = service.parseAccept(undefined);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe('*');
      expect(parsed[0].subtype).toBe('*');
      expect(parsed[0].quality).toBe(1);
    });

    it('should select Turtle as default when Accept is */*', () => {
      const parsed = service.parseAccept('*/*');
      const supported = ['text/turtle', 'application/rdf+xml'];

      const match = service.getBestMatch(parsed, supported);

      expect(match).not.toBeNull();
      expect(match?.type).toBe('text/turtle');
    });

    it('should select Turtle when Accept includes no match and wildcard fallback', () => {
      const parsed = service.parseAccept('application/unknown, */*;q=0.1');
      const supported = ['text/turtle'];

      const match = service.getBestMatch(parsed, supported);

      expect(match).not.toBeNull();
      expect(match?.type).toBe('text/turtle');
    });
  });

  describe('TC-GET-05: Unsupported Accept → 406', () => {
    it('should return null for unsupported Accept', () => {
      const parsed = service.parseAccept('application/not-supported');
      const supported = ['text/turtle'];

      const match = service.getBestMatch(parsed, supported);

      expect(match).toBeNull();
    });

    it('should return null when Accept excludes all supported', () => {
      const parsed = service.parseAccept('text/plain');
      const supported = ['text/turtle'];

      const match = service.getBestMatch(parsed, supported);

      expect(match).toBeNull();
    });
  });

  describe('Quality value parsing', () => {
    it('should parse Accept with q-values', () => {
      const parsed = service.parseAccept('text/turtle;q=0.8,application/rdf+xml;q=0.9');

      expect(parsed).toHaveLength(2);
      expect(parsed[0].quality).toBe(0.9);
      expect(parsed[1].quality).toBe(0.8);
    });

    it('should default quality to 1 when not specified', () => {
      const parsed = service.parseAccept('text/turtle,application/rdf+xml');

      expect(parsed[0].quality).toBe(1);
      expect(parsed[1].quality).toBe(1);
    });

    it('should sort by quality descending', () => {
      const parsed = service.parseAccept(
        'text/turtle;q=0.5,application/rdf+xml;q=0.9,application/ld+json',
      );

      expect(parsed[0].type).toBe('application');
      expect(parsed[0].subtype).toBe('ld+json');
      expect(parsed[1].type).toBe('application');
      expect(parsed[1].subtype).toBe('rdf+xml');
      expect(parsed[2].type).toBe('text');
      expect(parsed[2].subtype).toBe('turtle');
    });

    it('should handle implicit q=1', () => {
      const parsed = service.parseAccept('text/turtle;q=0.9,application/rdf+xml');

      expect(parsed[0].quality).toBe(1);
    });
  });

  describe('TC-FMT-03: Format selection', () => {
    it('should select exact match', () => {
      const parsed = service.parseAccept('application/rdf+xml');
      const supported = ['text/turtle', 'application/rdf+xml'];

      const match = service.getBestMatch(parsed, supported);

      expect(match?.type).toBe('application/rdf+xml');
    });

    it('should select subtype wildcard match', () => {
      const parsed = service.parseAccept('application/*');
      const supported = ['text/turtle', 'application/rdf+xml'];

      const match = service.getBestMatch(parsed, supported);

      expect(match?.type).toBe('application/rdf+xml');
    });

    it('should prefer exact matches over wildcards with equal q-values', () => {
      const parsed = service.parseAccept('application/*;q=1,application/rdf+xml;q=1');
      const supported = ['text/turtle', 'application/rdf+xml'];

      const match = service.getBestMatch(parsed, supported);

      expect(match?.type).toBe('application/rdf+xml');
    });

    it('should handle media type parameters', () => {
      const parsed = service.parseAccept('text/turtle;charset=utf-8');

      expect(parsed[0].params.charset).toBe('utf-8');
    });
  });

  describe('Content-Type validation', () => {
    it('should validate supported Content-Types', () => {
      const result = service.validateContentType('text/turtle');
      expect(result.valid).toBe(true);
    });

    it('should reject unsupported Content-Types', () => {
      const result = service.validateContentType('text/plain');
      expect(result.valid).toBe(false);
    });

    it('should parse charset from Content-Type', () => {
      const result = service.validateContentType('text/turtle;charset=utf-8');
      expect(result.valid).toBe(true);
      expect(result.charset).toBe('utf-8');
    });
  });

  describe('TC-RDF-03: missing Content-Type fallback (UR-RDF-03)', () => {
    it('inferContentType returns text/turtle for Turtle-looking content', () => {
      const buf = Buffer.from('@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .');
      expect(service.inferContentType(buf)).toBe('text/turtle');
    });

    it('inferContentType returns application/n-triples for N-Triples-looking content', () => {
      const buf = Buffer.from('<http://ex.org/s> <http://ex.org/p> <http://ex.org/o> .');
      expect(service.inferContentType(buf)).toBe('application/n-triples');
    });

    it('inferContentType returns application/rdf+xml as fallback', () => {
      const buf = Buffer.from('<?xml version="1.0"?>');
      expect(service.inferContentType(buf)).toBe('application/rdf+xml');
    });

    it('inferContentType returns application/rdf+xml for unrecognizable content', () => {
      const buf = Buffer.from('this is not parseable as a known RDF syntax');
      expect(service.inferContentType(buf)).toBe('application/rdf+xml');
    });

    it('inferContentType does not misclassify malformed N-Triples content', () => {
      const buf = Buffer.from('<http://ex.org/s> <http://ex.org/p> not-a-valid-object .');
      expect(service.inferContentType(buf)).toBe('application/rdf+xml');
    });

    it('inferContentType returns application/ld+json for JSON-like content', () => {
      const buf = Buffer.from('{ "not": "rdf" }');
      expect(service.inferContentType(buf)).toBe('application/ld+json');
    });
  });
});
