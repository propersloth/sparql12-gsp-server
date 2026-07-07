import { NotAcceptableException, NotFoundException } from '@nestjs/common';
import { DEFAULT_GRAPH_IRI } from '../../src/database/entities/graph.entity';
import type { Graph } from '../../src/database/entities/graph.entity';
import { RdfXmlSerializationException } from '../../src/rdf/rdf.exceptions';
import { GraphStoreService } from '../../src/graph-store/services/graph-store.service';

describe('GraphStoreService', () => {
  const mockNamedGraph: Pick<Graph, 'id' | 'iri' | 'version' | 'isDefault'> = {
    id: 'g-1',
    iri: 'http://ex.org/g',
    version: 7,
    isDefault: false,
  };

  const makeService = (overrides?: {
    findByIriOrDefault?: jest.Mock;
    findByGraphId?: jest.Mock;
    getBestMatch?: jest.Mock;
    compareStrong?: jest.Mock;
    serialize?: jest.Mock;
    serializeToDataset?: jest.Mock;
  }) => {
    const graphRepository = {
      findByIriOrDefault:
        overrides?.findByIriOrDefault ?? jest.fn(async () => ({ ...mockNamedGraph })),
    };
    const tripleRepository = {
      findByGraphId: overrides?.findByGraphId ?? jest.fn(async () => []),
    };
    const contentNegotiation = {
      parseAccept: jest.fn((a?: string) => a),
      getSupportedTypes: jest.fn(() => [
        'text/turtle',
        'application/trig',
        'application/n-quads',
        'application/ld+json',
        'application/rdf+xml',
      ]),
      getBestMatch:
        overrides?.getBestMatch ?? jest.fn(() => ({ type: 'text/turtle', quality: 1 })),
    };
    const etagService = {
      generate: jest.fn(() => '"g-1.7.text%2Fturtle"'),
      compareStrong: overrides?.compareStrong ?? jest.fn(() => false),
    };
    const rdfService = {
      triplesToDataset: jest.fn(() => ({ quads: [] })),
      serialize: overrides?.serialize ?? jest.fn(async () => 'ttl'),
      serializeToDataset: overrides?.serializeToDataset ?? jest.fn(async () => 'trig'),
    };
    const dataSource = {
      transaction: jest.fn(async (cb: (manager: unknown) => unknown) => cb({})),
    };
    const routing = {
      validateIri: jest.fn((iri: string) => ({ valid: true, normalizedIri: iri })),
    };
    const concurrency = {
      lock: jest.fn(),
    };
    const configService = {
      get: jest.fn(() => undefined),
    };

    const service = new GraphStoreService(
      dataSource as any,
      rdfService as any,
      routing as any,
      contentNegotiation as any,
      etagService as any,
      concurrency as any,
      graphRepository as any,
      tripleRepository as any,
      configService as any,
    );

    return {
      service,
      dataSource,
      graphRepository,
      tripleRepository,
      routing,
      contentNegotiation,
      etagService,
      rdfService,
      concurrency,
      configService,
    };
  };

  it('uses serialize() for triple formats', async () => {
    const { service, rdfService } = makeService({
      getBestMatch: jest.fn(() => ({ type: 'text/turtle', quality: 1 })),
    });

    const result = await service.getGraph('http://ex.org/g', 'text/turtle');

    expect(result.status).toBe(200);
    expect(result.content).toBe('ttl');
    expect((rdfService as any).triplesToDataset).toHaveBeenCalledWith([], null);
    expect((rdfService as any).serialize).toHaveBeenCalledTimes(1);
    expect((rdfService as any).serializeToDataset).not.toHaveBeenCalled();
  });

  it.each(['application/trig', 'application/n-quads', 'application/ld+json'])(
    'uses serializeToDataset() for quad format %s with null label for default graph',
    async (mediaType) => {
      const { service, rdfService } = makeService({
        findByIriOrDefault: jest.fn(async () => ({ ...mockNamedGraph, iri: DEFAULT_GRAPH_IRI, isDefault: true })),
        getBestMatch: jest.fn(() => ({ type: mediaType, quality: 1 })),
      });

      await service.getGraph(null, mediaType);

      expect((rdfService as any).triplesToDataset).toHaveBeenCalledWith([], null);
      expect((rdfService as any).serializeToDataset).toHaveBeenCalledWith(
        expect.anything(),
        mediaType,
        null,
      );
    },
  );

  it.each(['application/trig', 'application/n-quads', 'application/ld+json'])(
    'uses serializeToDataset() for quad format %s with named graph label',
    async (mediaType) => {
      const { service, rdfService } = makeService({
        getBestMatch: jest.fn(() => ({ type: mediaType, quality: 1 })),
      });

      await service.getGraph('http://ex.org/g', mediaType);

      expect((rdfService as any).triplesToDataset).toHaveBeenCalledWith([], null);
      expect((rdfService as any).serializeToDataset).toHaveBeenCalledWith(
        expect.anything(),
        mediaType,
        'http://ex.org/g',
      );
    },
  );

  it('returns 304 only when compareStrong matches', async () => {
    const { service, tripleRepository } = makeService({
      compareStrong: jest.fn(() => true),
    });

    const result = await service.getGraph('http://ex.org/g', 'text/turtle', '"g-1.7.text%2Fturtle"');

    expect(result.status).toBe(304);
    expect(result.content).toBe('');
    expect(tripleRepository.findByGraphId).not.toHaveBeenCalled();
  });

  it('returns 304 for If-None-Match wildcard when graph exists', async () => {
    const { service, etagService, tripleRepository } = makeService();

    const result = await service.getGraph('http://ex.org/g', 'text/turtle', '*');

    expect(result.status).toBe(304);
    expect(etagService.compareStrong).not.toHaveBeenCalled();
    expect(tripleRepository.findByGraphId).not.toHaveBeenCalled();
  });

  it('ignores malformed If-None-Match and serves 200', async () => {
    const { service, etagService } = makeService({
      compareStrong: jest.fn(() => {
        throw new Error('bad-etag');
      }),
    });

    const result = await service.getGraph('http://ex.org/g', 'text/turtle', 'bad');

    expect(result.status).toBe(200);
    expect(result.content).toBe('ttl');
    expect(etagService.compareStrong).toHaveBeenCalled();
  });

  it('returns 304 when a strong validator in an If-None-Match list matches', async () => {
    const compareStrong = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('bad-etag');
      })
      .mockImplementationOnce(() => true);
    const { service, tripleRepository } = makeService({ compareStrong });

    const result = await service.getGraph(
      'http://ex.org/g',
      'text/turtle',
      'bad, W/"g-1.7.text%2Fturtle", "g-1.7.text%2Fturtle"',
    );

    expect(result.status).toBe(304);
    expect(compareStrong).toHaveBeenNthCalledWith(1, 'bad', 'g-1', 7, 'text/turtle');
    expect(compareStrong).toHaveBeenNthCalledWith(2, '"g-1.7.text%2Fturtle"', 'g-1', 7, 'text/turtle');
    expect(tripleRepository.findByGraphId).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when graph is absent', async () => {
    const { service } = makeService({
      findByIriOrDefault: jest.fn(async () => null),
    });

    await expect(service.getGraph('http://ex.org/missing', 'text/turtle')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws NotAcceptableException when content negotiation fails', async () => {
    const { service } = makeService({
      getBestMatch: jest.fn(() => null),
    });

    await expect(service.getGraph('http://ex.org/g', 'application/not-supported')).rejects.toBeInstanceOf(
      NotAcceptableException,
    );
    await expect(service.headGraph('http://ex.org/g', 'application/not-supported')).rejects.toBeInstanceOf(
      NotAcceptableException,
    );
  });

  it('propagates RdfXmlSerializationException from RDF/XML serialization', async () => {
    const { service } = makeService({
      getBestMatch: jest.fn(() => ({ type: 'application/rdf+xml', quality: 1 })),
      serialize: jest.fn(async () => {
        throw new RdfXmlSerializationException('cannot be split into an XML QName');
      }),
    });

    await expect(service.getGraph('http://ex.org/g', 'application/rdf+xml')).rejects.toBeInstanceOf(
      RdfXmlSerializationException,
    );
  });

  it('headGraph generates ETag for negotiated media type', async () => {
    const { service, etagService } = makeService({
      getBestMatch: jest.fn(() => ({ type: 'application/ld+json', quality: 1 })),
    });

    const result = await service.headGraph('http://ex.org/g', 'application/ld+json');

    expect(result.contentType).toBe('application/ld+json');
    expect(etagService.generate).toHaveBeenCalledWith('g-1', 7, 'application/ld+json');
  });
});
