/**
 * Unit tests for PatchService
 * Tests validate, parse, scopeToGraph, and apply methods.
 */
import { UnprocessableEntityException } from '@nestjs/common';
import { PatchService } from '../../src/graph-store/services/patch.service';
import { RdfServiceImpl, NormalizedTriple } from '../../src/rdf/rdf.service';

describe('PatchService', () => {
  let patchService: PatchService;
  let rdfService: RdfServiceImpl;

  beforeEach(() => {
    rdfService = new RdfServiceImpl();
    patchService = new PatchService(rdfService);
  });

  describe('validate', () => {
    it('returns valid for valid SPARQL INSERT DATA', () => {
      const result = patchService.validate(
        'INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }',
      );
      expect(result.valid).toBe(true);
    });

    it('returns valid for valid SPARQL DELETE DATA', () => {
      const result = patchService.validate(
        'DELETE DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }',
      );
      expect(result.valid).toBe(true);
    });

    it('returns invalid for malformed SPARQL', () => {
      const result = patchService.validate('{ invalid @');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('parse', () => {
    it('returns operations for INSERT DATA', () => {
      const result = patchService.parse(
        'INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }',
      );
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].updateType).toBe('insert');
    });

    it('returns raw Update object', () => {
      const result = patchService.parse(
        'DELETE DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }',
      );
      expect(result.raw).toBeDefined();
      expect((result.raw as any).updates).toHaveLength(1);
    });
  });

  describe('scopeToGraph', () => {
    it('accepts INSERT DATA with bare triples (no GRAPH wrapper)', () => {
      const { operations } = patchService.parse(
        'INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }',
      );
      const result = patchService.scopeToGraph(operations, 'http://ex.org/g');
      expect(result.valid).toBe(true);
    });

    it('accepts INSERT DATA with matching GRAPH wrapper (M5)', () => {
      const { operations } = patchService.parse(
        'INSERT DATA { GRAPH <http://ex.org/g> { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> } }',
      );
      const result = patchService.scopeToGraph(operations, 'http://ex.org/g');
      expect(result.valid).toBe(true);
    });

    it('rejects INSERT DATA with foreign GRAPH wrapper (M5)', () => {
      const { operations } = patchService.parse(
        'INSERT DATA { GRAPH <http://ex.org/other> { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> } }',
      );
      const result = patchService.scopeToGraph(operations, 'http://ex.org/g');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('http://ex.org/other');
    });

    it('rejects WITH clause for different graph', () => {
      const { operations } = patchService.parse(
        'WITH <http://ex.org/other> INSERT { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> } WHERE {}',
      );
      const result = patchService.scopeToGraph(operations, 'http://ex.org/g');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('http://ex.org/other');
    });

    it('rejects any GRAPH clause when targetIri is null (default graph)', () => {
      const { operations } = patchService.parse(
        'INSERT DATA { GRAPH <http://ex.org/anything> { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> } }',
      );
      const result = patchService.scopeToGraph(operations, null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('(default)');
    });

    it('accepts bare triples for default graph (null targetIri)', () => {
      const { operations } = patchService.parse(
        'INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }',
      );
      const result = patchService.scopeToGraph(operations, null);
      expect(result.valid).toBe(true);
    });
  });

  describe('apply — delegates to RdfService.applyPatch', () => {
    const existing: NormalizedTriple[] = [
      {
        subject: 'http://ex.org/s',
        subjectType: 'U',
        predicate: 'http://ex.org/p',
        object: 'http://ex.org/o',
        objectType: 'U',
      },
    ];

    it('applies INSERT DATA', async () => {
      const parsed = patchService.parse(
        'INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/new> }',
      );
      const result = await patchService.apply(existing, parsed, 'http://ex.org/g');
      expect(result).toHaveLength(2);
      expect(result.some((t: NormalizedTriple) => t.object === 'http://ex.org/new')).toBe(true);
    });

    it('applies DELETE DATA', async () => {
      const parsed = patchService.parse(
        'DELETE DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }',
      );
      const result = await patchService.apply(existing, parsed, 'http://ex.org/g');
      expect(result).toHaveLength(0);
    });
  });
});

describe('RdfService.applyPatch — insertdelete (trivial WHERE)', () => {
  let rdfService: RdfServiceImpl;

  const existing: NormalizedTriple[] = [
    {
      subject: 'http://ex.org/s',
      subjectType: 'U',
      predicate: 'http://ex.org/p',
      object: 'http://ex.org/o',
      objectType: 'U',
    },
  ];

  beforeEach(() => {
    rdfService = new RdfServiceImpl();
  });

  it('DELETE { ?s ?p ?o } WHERE { ?s ?p ?o } clears all triples', async () => {
    const { Parser } = await import('sparqljs');
    const parsed = new Parser().parse('DELETE { ?s ?p ?o } WHERE { ?s ?p ?o }') as any;
    const result = await rdfService.applyPatch(existing, parsed, 'http://ex.org/g');
    expect(result).toHaveLength(0);
  });

  it('DELETE { ?s ?p ?o } WHERE {} deletes nothing (empty WHERE = one empty binding)', async () => {
    const { Parser } = await import('sparqljs');
    const parsed = new Parser().parse('DELETE { ?s ?p ?o } WHERE {}') as any;
    // WHERE {} returns one empty binding, so DELETE template instantiates with no vars bound,
    // treating ?s ?p ?o as unbound — which matches nothing and leaves the graph unchanged.
    // Actually with empty binding, variable substitution yields null → triple not instantiated.
    const result = await rdfService.applyPatch(existing, parsed, 'http://ex.org/g');
    // The empty binding means ?s ?p ?o don't resolve → no triples deleted
    expect(result).toHaveLength(1);
  });

  it('DELETE { ?s ?p ?o } INSERT { ?s ?p "changed" } WHERE { ?s ?p ?o } replaces object', async () => {
    const { Parser } = await import('sparqljs');
    const parsed = new Parser().parse(
      'DELETE { ?s ?p ?o } INSERT { ?s ?p "changed" } WHERE { ?s ?p ?o }',
    ) as any;
    const result = await rdfService.applyPatch(existing, parsed, 'http://ex.org/g');
    expect(result).toHaveLength(1);
    expect(result[0].object).toBe('changed');
    expect(result[0].objectType).toBe('L');
  });

  it('complex WHERE pattern → 422 (UnprocessableEntityException)', async () => {
    const { Parser } = await import('sparqljs');
    const parsed = new Parser().parse(
      `DELETE { ?s ?p ?o } INSERT { ?s ?p "changed" } WHERE { ?s ?p ?o . FILTER(?p = <http://ex.org/p>) }`,
    ) as any;
    await expect(rdfService.applyPatch(existing, parsed, 'http://ex.org/g')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('GRAPH-wrapped INSERT DATA matching target is accepted', async () => {
    const { Parser } = await import('sparqljs');
    const parsed = new Parser().parse(
      'INSERT DATA { GRAPH <http://ex.org/g> { <http://ex.org/s> <http://ex.org/p> <http://ex.org/new> } }',
    ) as any;
    const result = await rdfService.applyPatch(existing, parsed, 'http://ex.org/g');
    expect(result).toHaveLength(2);
    expect(result.some((t: NormalizedTriple) => t.object === 'http://ex.org/new')).toBe(true);
  });
});
