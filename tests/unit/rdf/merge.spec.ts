// TEST MATRIX: TC-POST-01, TC-POST-02, shared blank-node identity (v3 D-1)
import * as path from 'path';
import * as fs from 'fs';
import {
  RdfServiceImpl,
  NormalizedTriple,
} from '../../../src/rdf/rdf.service';
import {
  assertIsomorphic,
  countDistinctBlankNodes,
} from '../../helpers/rdf.helper';

const FIXTURES = path.join(__dirname, '../../fixtures');

function readFixture(file: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES, file));
}

describe('RdfService Merge', () => {
  let svc: RdfServiceImpl;

  beforeEach(() => {
    svc = new RdfServiceImpl();
  });

  it('TC-POST-01: disjoint merge keeps all triples', async () => {
    const a = await svc.parse(
      Buffer.from('@prefix ex:<http://e/>. ex:s1 ex:p ex:o1 .'),
      'text/turtle',
    );
    const b = await svc.parse(
      Buffer.from('@prefix ex:<http://e/>. ex:s2 ex:p ex:o2 .'),
      'text/turtle',
    );
    expect(svc.merge(a, b).size).toBe(2);
  });

  it('TC-POST-01: identical ground triples dedupe', async () => {
    const a = await svc.parse(
      Buffer.from('@prefix ex:<http://e/>. ex:s ex:p ex:o .'),
      'text/turtle',
    );
    expect(svc.merge(a, a).size).toBe(1);
  });

  it('TC-POST-02: reused bnode label across operands does NOT collapse (standardize-apart)', async () => {
    const existing = await svc.parse(
      readFixture('turtle/blank-nodes.ttl'),
      'text/turtle',
    );
    const incoming = await svc.parse(
      Buffer.from(
        '@prefix ex:<http://e/>. ex:s3 ex:p _:b1 . _:b1 ex:p2 "new" .',
      ),
      'text/turtle',
    );
    const merged = svc.merge(existing, incoming);
    expect(merged.size).toBe(existing.size + incoming.size);
    expect(countDistinctBlankNodes(merged)).toBe(
      countDistinctBlankNodes(existing) + countDistinctBlankNodes(incoming),
    );
  });

  describe('mergeNormalized (TC-POST-01 at row level)', () => {
    it('deduplicates identical ground triples', () => {
      const t: NormalizedTriple = {
        subject: 'http://e/s',
        subjectType: 'U',
        predicate: 'http://e/p',
        object: 'http://e/o',
        objectType: 'U',
      };
      expect(svc.mergeNormalized([t], [t])).toHaveLength(1);
    });

    it('unions disjoint rows', () => {
      const t1: NormalizedTriple = {
        subject: 'http://e/s1',
        subjectType: 'U',
        predicate: 'http://e/p',
        object: 'http://e/o1',
        objectType: 'U',
      };
      const t2: NormalizedTriple = {
        subject: 'http://e/s2',
        subjectType: 'U',
        predicate: 'http://e/p',
        object: 'http://e/o2',
        objectType: 'U',
      };
      expect(svc.mergeNormalized([t1], [t2])).toHaveLength(2);
    });

    it('bnode labels already unique after skolemization — no collision', () => {
      const t1: NormalizedTriple = {
        subject: 'http://e/s',
        subjectType: 'U',
        predicate: 'http://e/p',
        object: 'genid-aaa',
        objectType: 'B',
      };
      const t2: NormalizedTriple = {
        subject: 'http://e/s',
        subjectType: 'U',
        predicate: 'http://e/p',
        object: 'genid-bbb',
        objectType: 'B',
      };
      expect(svc.mergeNormalized([t1], [t2])).toHaveLength(2);
    });
  });

  describe('shared blank-node identity (v3, D-1 — the C1 regression guard)', () => {
    it('a blank node used as object of one triple and subject of another gets ONE label, not two', async () => {
      const rows = await svc.parseWithReconciliation(
        Buffer.from(
          '@prefix ex:<http://e/>. ex:s ex:p _:b1 . _:b1 ex:q "v" .',
        ),
        'text/turtle',
        null,
      );
      expect(rows).toHaveLength(2);
      const objectRow = rows.find((r) => r.predicate === 'http://e/p')!;
      const subjectRow = rows.find((r) => r.predicate === 'http://e/q')!;
      expect(objectRow.objectType).toBe('B');
      expect(subjectRow.subjectType).toBe('B');
      expect(objectRow.object).toBe(subjectRow.subject);
    });

    it('two separate parseWithReconciliation calls never collide on the same source label', async () => {
      const ttl = '@prefix ex:<http://e/>. ex:s ex:p _:b1 .';
      const rows1 = await svc.parseWithReconciliation(
        Buffer.from(ttl),
        'text/turtle',
        null,
      );
      const rows2 = await svc.parseWithReconciliation(
        Buffer.from(ttl),
        'text/turtle',
        null,
      );
      expect(rows1[0].object).not.toBe(rows2[0].object);
    });

    it('row round-trip: triplesToDataset reconstructs the shared bnode, then re-serializes isomorphically', async () => {
      const original =
        '@prefix ex:<http://e/>. ex:s ex:p _:b1 . _:b1 ex:q "v" .';
      const rows = await svc.parseWithReconciliation(
        Buffer.from(original),
        'text/turtle',
        null,
      );
      const ds = svc.triplesToDataset(rows, null);
      const serialized = await svc.serialize(ds, 'text/turtle');
      await assertIsomorphic(svc, original, serialized, 'text/turtle');
    });
  });
});
