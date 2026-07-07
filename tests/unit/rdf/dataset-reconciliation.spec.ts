// TEST MATRIX: TC-FMT-04, TC-FMT-05, TC-FMT-06, TC-FMT-07
import * as path from 'path';
import * as fs from 'fs';
import {
  RdfServiceImpl,
  DatasetMismatchException,
} from '../../../src/rdf/rdf.service';

const FIXTURES = path.join(__dirname, '../../fixtures');

function readFixture(file: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES, file));
}

describe('RdfService parseWithReconciliation (dataset reconciliation)', () => {
  let svc: RdfServiceImpl;

  beforeEach(() => {
    svc = new RdfServiceImpl();
  });

  it('TC-FMT-04: Turtle (default-graph only) accepted for named target', async () => {
    const rows = await svc.parseWithReconciliation(
      readFixture('turtle/sample-graph.ttl'),
      'text/turtle',
      'http://example.org/target',
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('TC-FMT-05: TriG with matching named graph accepted for that target', async () => {
    const trig = Buffer.from(`
      @prefix ex: <http://example.org/> .
      ex:target { ex:s ex:p ex:o . }
    `);
    const rows = await svc.parseWithReconciliation(
      trig,
      'application/trig',
      'http://example.org/target',
    );
    expect(rows.length).toBe(1);
  });

  it('TC-FMT-06: TriG with matching named graph and default-graph triples both accepted', async () => {
    const trig = Buffer.from(`
      @prefix ex: <http://example.org/> .
      ex:target { ex:s ex:p ex:o . }
      ex:s2 ex:p2 ex:o2 .
    `);
    const rows = await svc.parseWithReconciliation(
      trig,
      'application/trig',
      'http://example.org/target',
    );
    expect(rows.length).toBe(2);
  });

  it('TC-FMT-07: TriG with foreign named graph → DatasetMismatchException (400)', async () => {
    await expect(
      svc.parseWithReconciliation(
        readFixture('trig/foreign-graph.trig'),
        'application/trig',
        'http://example.org/target',
      ),
    ).rejects.toBeInstanceOf(DatasetMismatchException);
  });

  it('TC-FMT-07 variant: any named graph when target is default graph → DatasetMismatchException', async () => {
    const trig = Buffer.from(`
      @prefix ex: <http://example.org/> .
      ex:g { ex:s ex:p ex:o . }
    `);
    await expect(
      svc.parseWithReconciliation(trig, 'application/trig', null),
    ).rejects.toBeInstanceOf(DatasetMismatchException);
  });
});
