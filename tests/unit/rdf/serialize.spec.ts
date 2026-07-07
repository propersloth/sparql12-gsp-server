// TEST MATRIX: TC-FMT-08, TC-FMT-09, TC-RDF-05, TC-RDF-06
import * as path from 'path';
import * as fs from 'fs';
import {
  RdfServiceImpl,
  RdfXmlSerializationException,
} from '../../../src/rdf/rdf.service';

const FIXTURES = path.join(__dirname, '../../fixtures');

function readFixture(file: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES, file));
}

describe('RdfService Serialize', () => {
  let svc: RdfServiceImpl;

  beforeEach(() => {
    svc = new RdfServiceImpl();
  });

  it('TC-FMT-08: named graph → TriG labelled by G', async () => {
    const ds = await svc.parse(
      Buffer.from('@prefix ex:<http://e/>. ex:s1 ex:p1 ex:o1 .'),
      'text/turtle',
    );
    const trig = await svc.serializeToDataset(
      ds,
      'application/trig',
      'http://e/g1',
    );
    expect(trig).toMatch(/<http:\/\/e\/g1>\s*\{/);
  });

  it('TC-FMT-09: default graph → no graph label in N-Quads', async () => {
    const ds = await svc.parse(
      Buffer.from('@prefix ex:<http://e/>. ex:s1 ex:p1 ex:o1 .'),
      'text/turtle',
    );
    const nq = await svc.serializeToDataset(ds, 'application/n-quads', null);
    expect(nq.trim()).toMatch(/^<.+> <.+> <.+> \.$/);
  });

  it('TC-RDF-05: unsplittable predicate IRI → RdfXmlSerializationException', async () => {
    const ds = await svc.parse(
      readFixture('adversarial/unsplittable-predicate.ttl'),
      'text/turtle',
    );
    await expect(
      svc.serialize(ds, 'application/rdf+xml'),
    ).rejects.toBeInstanceOf(RdfXmlSerializationException);
    // Sanity: same dataset serializes fine in other formats
    await expect(svc.serialize(ds, 'text/turtle')).resolves.toBeTruthy();
    await expect(
      svc.serialize(ds, 'application/n-triples'),
    ).resolves.toBeTruthy();
  });

  it('TC-RDF-06: XML-illegal literal character → RdfXmlSerializationException', async () => {
    const ds = await svc.parse(
      readFixture('adversarial/xml-illegal-literal.ttl'),
      'text/turtle',
    );
    await expect(
      svc.serialize(ds, 'application/rdf+xml'),
    ).rejects.toBeInstanceOf(RdfXmlSerializationException);
    await expect(
      svc.serialize(ds, 'application/ld+json'),
    ).resolves.toBeTruthy();
  });
});
