// TEST MATRIX: triplesToDataset round-trip
import { RdfServiceImpl, NormalizedTriple } from '../../../src/rdf/rdf.service';
import { countDistinctBlankNodes } from '../../helpers/rdf.helper';

describe('triplesToDataset', () => {
  let svc: RdfServiceImpl;

  beforeEach(() => {
    svc = new RdfServiceImpl();
  });

  it('round-trips IRI object', () => {
    const rows: NormalizedTriple[] = [
      {
        subject: 'http://e/s',
        subjectType: 'U',
        predicate: 'http://e/p',
        object: 'http://e/o',
        objectType: 'U',
      },
    ];
    const ds = svc.triplesToDataset(rows, 'http://e/g');
    expect(ds.size).toBe(1);
    const [q] = [...ds];
    expect(q.object.termType).toBe('NamedNode');
    expect(q.object.value).toBe('http://e/o');
  });

  it('round-trips language-tagged literal', () => {
    const rows: NormalizedTriple[] = [
      {
        subject: 'http://e/s',
        subjectType: 'U',
        predicate: 'http://e/p',
        object: 'hello',
        objectType: 'L',
        langTag: 'en',
      },
    ];
    const ds = svc.triplesToDataset(rows, null);
    const [q] = [...ds];
    expect(q.object.termType).toBe('Literal');
    expect((q.object as { language: string }).language).toBe('en');
  });

  it('round-trips blank-node object (type B) as BlankNode term', () => {
    const rows: NormalizedTriple[] = [
      {
        subject: 'http://e/s',
        subjectType: 'U',
        predicate: 'http://e/p',
        object: 'genid-abc123',
        objectType: 'B',
      },
    ];
    const ds = svc.triplesToDataset(rows, null);
    const [q] = [...ds];
    expect(q.object.termType).toBe('BlankNode');
    expect(q.object.value).toBe('genid-abc123');
  });

  it('round-trips blank-node SUBJECT (type B) as BlankNode term (v3, D-1)', () => {
    const rows: NormalizedTriple[] = [
      {
        subject: 'genid-subj789',
        subjectType: 'B',
        predicate: 'http://e/p',
        object: 'http://e/o',
        objectType: 'U',
      },
    ];
    const ds = svc.triplesToDataset(rows, null);
    const [q] = [...ds];
    expect(q.subject.termType).toBe('BlankNode');
    expect(q.subject.value).toBe('genid-subj789');
  });

  it('the SAME label used as subjectType B and objectType B in two rows reconstructs as one shared blank node', () => {
    const rows: NormalizedTriple[] = [
      {
        subject: 'http://e/s',
        subjectType: 'U',
        predicate: 'http://e/p',
        object: 'genid-shared',
        objectType: 'B',
      },
      {
        subject: 'genid-shared',
        subjectType: 'B',
        predicate: 'http://e/q',
        object: 'v',
        objectType: 'L',
      },
    ];
    const ds = svc.triplesToDataset(rows, null);
    expect(countDistinctBlankNodes(ds)).toBe(1);
  });
});
