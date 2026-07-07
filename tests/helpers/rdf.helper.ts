import type { DatasetCore } from '@rdfjs/types';
import { canonize } from 'rdf-canonize';

import { RdfService } from '../../src/rdf/rdf.service';

export { RdfService };

/**
 * Assert two RDF serializations represent isomorphic graphs using RDFC-1.0.
 * @param ctA  Content-type of string `a`
 * @param ctB  Content-type of string `b`; defaults to ctA (same format)
 */
export async function assertIsomorphic(
  svc: RdfService,
  a: string,
  b: string,
  ctA: string,
  ctB = ctA,
): Promise<void> {
  const da = [...(await svc.parse(Buffer.from(a), ctA))];
  const db = [...(await svc.parse(Buffer.from(b), ctB))];
  const ca = await canonize(da, { algorithm: 'RDFC-1.0' });
  const cb = await canonize(db, { algorithm: 'RDFC-1.0' });
  expect(ca).toEqual(cb);
}

export function countDistinctBlankNodes(ds: DatasetCore): number {
  const ids = new Set<string>();
  for (const q of ds) {
    if (q.subject.termType === 'BlankNode') ids.add(q.subject.value);
    if (q.object.termType === 'BlankNode') ids.add(q.object.value);
  }
  return ids.size;
}

export async function assertBlankNodesDistinct(
  rdfService: RdfService,
  dataset1: string,
  dataset2: string,
  merged: string,
  contentType: string,
): Promise<void> {
  const ds1 = await rdfService.parse(Buffer.from(dataset1), contentType);
  const ds2 = await rdfService.parse(Buffer.from(dataset2), contentType);
  const mergedDs = await rdfService.parse(Buffer.from(merged), contentType);

  const mergedTriples = mergedDs.size;
  const ds1Triples = ds1.size;
  const ds2Triples = ds2.size;

  expect(mergedTriples).toBeGreaterThanOrEqual(ds1Triples + ds2Triples - 1);
}

