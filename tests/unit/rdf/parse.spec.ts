// TEST MATRIX: TC-RDF-01, TC-RDF-02
import * as path from 'path';
import * as fs from 'fs';
import { RdfServiceImpl, ParseException } from '../../../src/rdf/rdf.service';

const FIXTURES = path.join(__dirname, '../../fixtures');

function readFixture(file: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES, file));
}

function readFixtureText(file: string): string {
  return fs.readFileSync(path.join(FIXTURES, file), 'utf-8');
}

describe('RdfService Parse', () => {
  let svc: RdfServiceImpl;

  beforeEach(() => {
    svc = new RdfServiceImpl();
  });

  describe('TC-RDF-01: parse all 6 formats', () => {
    it.each([
      ['turtle/sample-graph.ttl', 'text/turtle'],
      ['rdfxml/sample-graph.rdf', 'application/rdf+xml'],
      ['ntriples/sample-graph.nt', 'application/n-triples'],
      ['jsonld/sample-graph.jsonld', 'application/ld+json'],
      ['trig/multi-graph.trig', 'application/trig'],
      ['nquads/sample-graph.nq', 'application/n-quads'],
    ])('parses %s', async (file, ct) => {
      const ds = await svc.parse(readFixture(file), ct);
      expect(ds.size).toBeGreaterThan(0);
    });
  });

  describe('TC-RDF-02: parse failure → ParseException (class, not string)', () => {
    it.each([
      ['{{bad', 'text/turtle'],
      [readFixtureText('adversarial/malformed-rdf.xml'), 'application/rdf+xml'],
      ['{bad json}', 'application/ld+json'],
      ['', 'application/rdf+xml'],
    ])('throws ParseException for %s (%s)', async (body, ct) => {
      await expect(
        svc.parse(Buffer.from(body), ct),
      ).rejects.toBeInstanceOf(ParseException);
    });
  });
});
