import { RdfService } from '../../src/rdf/rdf.service';

export async function assertIsomorphic(
  rdfService: RdfService,
  actual: string,
  expected: string,
  contentType: string,
): Promise<void> {
  const actualDataset = await rdfService.parse(Buffer.from(actual), contentType);
  const expectedDataset = await rdfService.parse(
    Buffer.from(expected),
    contentType,
  );

  const actualCanonical = await rdfService.serialize(
    actualDataset,
    'application/n-triples',
  );
  const expectedCanonical = await rdfService.serialize(
    expectedDataset,
    'application/n-triples',
  );

  const normalizeNt = (nt: string) =>
    nt
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .sort()
      .join('\n');

  expect(normalizeNt(actualCanonical)).toEqual(normalizeNt(expectedCanonical));
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
