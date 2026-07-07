// TEST MATRIX: TC-ID-01 to TC-ID-08

import { GraphRoutingService } from '../../src/graph-store/services/graph-routing.service';

describe('GraphRoutingService', () => {
  let service: GraphRoutingService;

  beforeEach(() => {
    service = new GraphRoutingService();
  });

  describe('TC-ID-01: Round-trip graph identification', () => {
    it('should resolve direct path /graph/{iri}', () => {
      const req = {
        path: '/graph/http%3A%2F%2Fexample.org%2Fgraph',
        query: {},
        params: { iri: 'http://example.org/graph' },
      } as any;

      const target = service.resolveTarget(req);

      expect(target.iri).toBe('http://example.org/graph');
      expect(target.isDefault).toBe(false);
      expect(target.isIndirect).toBe(false);
    });

    it('should resolve indirect ?graph={iri}', () => {
      const req = {
        path: '/graph-store',
        query: { graph: 'http://example.org/graph' },
        params: {},
      } as any;

      const target = service.resolveTarget(req);

      expect(target.iri).toBe('http://example.org/graph');
      expect(target.isDefault).toBe(false);
      expect(target.isIndirect).toBe(true);
    });

    it('should resolve ?default for default graph', () => {
      const req = {
        path: '/graph-store',
        query: { default: '' },
        params: {},
      } as any;

      const target = service.resolveTarget(req);

      expect(target.iri).toBeNull();
      expect(target.isDefault).toBe(true);
    });
  });

  describe('TC-ID-02: Percent-encoded IRI in path', () => {
    it('should decode percent-encoded IRI in path', () => {
      const req = {
        path: '/graph/http%3A%2F%2Fexample.org%2Fmy%20graph',
        query: {},
        params: { iri: 'http://example.org/my graph' },
      } as any;

      const target = service.resolveTarget(req);

      expect(target.iri).toBe('http://example.org/my graph');
      expect(target.rawIri).toBe('http%3A%2F%2Fexample.org%2Fmy%20graph');
    });

    it('should handle special characters in IRI', () => {
      const req = {
        path: '/graph/http%3A%2F%2Fexample.org%2F%7Btest%7D',
        query: {},
        params: { iri: 'http://example.org/{test}' },
      } as any;

      const target = service.resolveTarget(req);

      expect(target.iri).toBe('http://example.org/{test}');
    });
  });

  describe('TC-ID-03: ?default routing', () => {
    it('should route ?default to default graph', () => {
      const req = {
        path: '/graph-store',
        query: { default: '' },
        params: {},
      } as any;

      const target = service.resolveTarget(req);

      expect(target.isDefault).toBe(true);
      expect(target.iri).toBeNull();
    });

    it('should prefer ?default over ?graph', () => {
      const req = {
        path: '/graph-store',
        query: { default: '', graph: 'http://example.org/other' },
        params: {},
      } as any;

      const target = service.resolveTarget(req);

      expect(target.isDefault).toBe(true);
    });
  });

  describe('TC-ID-04: Default graph indirect-only', () => {
    it('should reject /graph/ with null-like path', () => {
      const req = {
        path: '/graph/null',
        query: {},
        params: { iri: 'null' },
      } as any;

      const target = service.resolveTarget(req);

      expect(target.isDefault).toBe(false);
    });
  });

  describe('TC-ID-05: Non-absolute IRI validation', () => {
    it('should reject relative IRI', () => {
      const result = service.validateIri('relative/path');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('absolute');
    });

    it('should reject IRI without scheme', () => {
      const result = service.validateIri('example.org/graph');

      expect(result.valid).toBe(false);
    });

    it('should accept absolute HTTP IRI', () => {
      const result = service.validateIri('http://example.org/graph');

      expect(result.valid).toBe(true);
      expect(result.normalizedIri).toBe('http://example.org/graph');
    });

    it('should accept HTTPS IRI', () => {
      const result = service.validateIri('https://example.org/graph');

      expect(result.valid).toBe(true);
    });

    it('should normalize IRI (lowercase scheme)', () => {
      const result = service.validateIri('HTTP://example.org/graph');

      expect(result.valid).toBe(true);
      expect(result.normalizedIri).toBe('http://example.org/graph');
    });
  });

  describe('TC-ID-06: Direct vs indirect equivalence', () => {
    it('should resolve /graph/{iri} equivalent to ?graph={iri}', () => {
      const directReq = {
        path: '/graph/http%3A%2F%2Fexample.org%2Fgraph',
        query: {},
        params: { iri: 'http://example.org/graph' },
      } as any;

      const indirectReq = {
        path: '/graph-store',
        query: { graph: 'http://example.org/graph' },
        params: {},
      } as any;

      const direct = service.resolveTarget(directReq);
      const indirect = service.resolveTarget(indirectReq);

      expect(direct.iri).toBe(indirect.iri);
      expect(direct.isDefault).toBe(indirect.isDefault);
    });
  });

  describe('TC-ID-07: Unresolvable IRI', () => {
    it('should reject invalid percent encoding', () => {
      const result = service.validateIri('http://example.org/%ZZ');

      expect(result.valid).toBe(false);
    });

    it('should reject IRI with control characters', () => {
      const result = service.validateIri('http://example.org/\ngraph');

      expect(result.valid).toBe(false);
    });
  });

  describe('TC-ID-08: Reserved namespace', () => {
    it('should handle system namespace', () => {
      const result = service.validateIri('http://www.w3.org/1999/02/22-rdf-syntax-ns#');

      expect(typeof result.valid).toBe('boolean');
    });
  });
});
