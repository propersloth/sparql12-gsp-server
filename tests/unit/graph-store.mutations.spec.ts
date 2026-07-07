import {
  BadRequestException,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { DEFAULT_GRAPH_IRI } from '../../src/database/entities/graph.entity';
import { GraphStoreService } from '../../src/graph-store/services/graph-store.service';
import { CANONICAL_MUTATION_FORMAT } from '../../src/graph-store/services/etag.service';

describe('GraphStoreService mutations', () => {
  const triple = {
    subject: 'http://ex.org/s',
    subjectType: 'U' as const,
    predicate: 'http://ex.org/p',
    object: 'http://ex.org/o',
    objectType: 'U' as const,
  };

  const makeService = () => {
    const manager = { tx: true };
    const dataSource = {
      transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    const rdfService = {
      parseWithReconciliation: jest.fn(async () => [triple]),
      mergeNormalized: jest.fn((existing, incoming) => [...existing, ...incoming]),
    };
    const routing = {
      validateIri: jest.fn((iri: string) => ({ valid: true, normalizedIri: iri.toLowerCase() })),
    };
    const contentNegotiation = {
      validateContentType: jest.fn((contentType: string) => {
        const [mediaType] = contentType.split(';').map((part) => part.trim());
        const [type, subtype] = mediaType.split('/');
        return { valid: true, type, subtype };
      }),
      inferContentType: jest.fn(() => 'text/turtle'),
    };
    const etagService = {
      generate: jest.fn(() => '"etag"'),
      compareState: jest.fn(() => true),
    };
    const concurrency = {
      lock: jest.fn(),
    };
    const graphRepository = {
      findByIriOrDefaultInTxn: jest.fn(),
      createInTxn: jest.fn(),
      incrementVersionInTxn: jest.fn(async () => 8),
      deleteInTxn: jest.fn(),
    };
    const tripleRepository = {
      findByGraphIdInTxn: jest.fn(async () => []),
      deleteByGraphIdInTxn: jest.fn(),
      insertInTxn: jest.fn(),
    };
    const configService = {
      get: jest.fn((key: string) => (key === 'GSP_BASE_URL' ? 'http://api.example.com' : undefined)),
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
      {} as any,
    );

    return {
      service,
      manager,
      dataSource,
      rdfService,
      routing,
      contentNegotiation,
      etagService,
      concurrency,
      graphRepository,
      tripleRepository,
      configService,
    };
  };

  it('PUT creates a new named graph with normalized lock key and canonical ETag', async () => {
    const ctx = makeService();
    ctx.graphRepository.findByIriOrDefaultInTxn.mockResolvedValue(null);
    ctx.graphRepository.createInTxn.mockResolvedValue({ id: 'graph-1' });

    const result = await ctx.service.putGraph(
      'HTTP://EX.ORG/Graph',
      Buffer.from('@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .'),
      'text/turtle; charset=utf-8',
    );

    expect(ctx.routing.validateIri).toHaveBeenCalledWith('HTTP://EX.ORG/Graph');
    expect(ctx.rdfService.parseWithReconciliation).toHaveBeenCalledWith(
      expect.any(Buffer),
      'text/turtle',
      'http://ex.org/graph',
    );
    expect(ctx.concurrency.lock).toHaveBeenCalledWith(ctx.manager, 'http://ex.org/graph');
    expect(ctx.graphRepository.createInTxn).toHaveBeenCalledWith(ctx.manager, 'http://ex.org/graph');
    expect(ctx.tripleRepository.insertInTxn).toHaveBeenCalledWith(ctx.manager, 'graph-1', [triple]);
    expect(ctx.etagService.generate).toHaveBeenCalledWith('graph-1', 8, CANONICAL_MUTATION_FORMAT);
    expect(result).toEqual({
      status: 201,
      etag: '"etag"',
      location: 'http://ex.org/graph',
    });
  });

  it('PUT empty default graph clears triples, keeps the row, and bumps version', async () => {
    const ctx = makeService();
    ctx.graphRepository.findByIriOrDefaultInTxn.mockResolvedValue({
      id: 'default-id',
      version: 4,
      isDefault: true,
    });

    const result = await ctx.service.putGraph(null, Buffer.alloc(0), 'text/turtle');

    expect(ctx.routing.validateIri).not.toHaveBeenCalled();
    expect(ctx.concurrency.lock).toHaveBeenCalledWith(ctx.manager, DEFAULT_GRAPH_IRI);
    expect(ctx.tripleRepository.deleteByGraphIdInTxn).toHaveBeenCalledWith(ctx.manager, 'default-id');
    expect(ctx.graphRepository.deleteInTxn).not.toHaveBeenCalled();
    expect(ctx.graphRepository.incrementVersionInTxn).toHaveBeenCalledWith(ctx.manager, 'default-id');
    expect(result).toEqual({ status: 204, etag: '"etag"' });
  });

  it('PUT honors stale If-Match and leaves the graph untouched', async () => {
    const ctx = makeService();
    ctx.graphRepository.findByIriOrDefaultInTxn.mockResolvedValue({
      id: 'graph-1',
      version: 7,
      isDefault: false,
    });
    ctx.etagService.compareState.mockReturnValue(false);

    await expect(
      ctx.service.putGraph(
        'http://ex.org/cc',
        Buffer.from('@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .'),
        'text/turtle',
        { ifMatch: '"stale"' },
      ),
    ).rejects.toBeInstanceOf(PreconditionFailedException);

    expect(ctx.tripleRepository.deleteByGraphIdInTxn).not.toHaveBeenCalled();
    expect(ctx.graphRepository.createInTxn).not.toHaveBeenCalled();
  });

  it('POST merges using the in-transaction read path and canonical mutation ETag', async () => {
    const ctx = makeService();
    ctx.graphRepository.findByIriOrDefaultInTxn.mockResolvedValue({
      id: 'graph-1',
      version: 7,
      isDefault: false,
    });
    ctx.tripleRepository.findByGraphIdInTxn.mockResolvedValue([triple] as any);

    const result = await ctx.service.postGraph(
      Buffer.from('@prefix ex:<http://ex.org/>. ex:s2 ex:p ex:o2 .'),
      'text/turtle',
      'HTTP://EX.ORG/Merge',
    );

    expect(ctx.concurrency.lock).toHaveBeenCalledWith(ctx.manager, 'http://ex.org/merge');
    expect(ctx.tripleRepository.findByGraphIdInTxn).toHaveBeenCalledWith(ctx.manager, 'graph-1');
    expect(ctx.rdfService.mergeNormalized).toHaveBeenCalledWith([triple], [triple]);
    expect(ctx.graphRepository.incrementVersionInTxn).toHaveBeenCalledWith(ctx.manager, 'graph-1');
    expect(ctx.etagService.generate).toHaveBeenCalledWith('graph-1', 8, CANONICAL_MUTATION_FORMAT);
    expect(result).toEqual({ status: 200, etag: '"etag"' });
  });

  it('POST to the store mints an absolute graph IRI under the configured base URL', async () => {
    const ctx = makeService();
    ctx.graphRepository.createInTxn.mockResolvedValue({ id: 'minted-id' });

    const result = await ctx.service.postGraph(
      Buffer.from('@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .'),
      'text/turtle',
    );

    expect(ctx.graphRepository.createInTxn).toHaveBeenCalledWith(
      ctx.manager,
      expect.stringMatching(/^http:\/\/api\.example\.com\/graphs\/[0-9a-f-]{36}$/),
    );
    expect(result.status).toBe(201);
    expect(result.location).toMatch(/^http:\/\/api\.example\.com\/graphs\/[0-9a-f-]{36}$/);
    expect(ctx.etagService.generate).toHaveBeenCalledWith('minted-id', 8, CANONICAL_MUTATION_FORMAT);
  });

  it('builds minted graph IRIs from the configured base URL', () => {
    const ctx = makeService();

    expect(ctx.service.mintedGraphIri('1234')).toBe('http://api.example.com/graphs/1234');
  });

  it('DELETE on the default graph clears triples and invalidates prior ETags', async () => {
    const ctx = makeService();
    ctx.graphRepository.findByIriOrDefaultInTxn.mockResolvedValue({
      id: 'default-id',
      version: 4,
      isDefault: true,
    });

    const result = await ctx.service.deleteGraph(null, { ifMatch: '"fresh"' });

    expect(ctx.concurrency.lock).toHaveBeenCalledWith(ctx.manager, DEFAULT_GRAPH_IRI);
    expect(ctx.tripleRepository.deleteByGraphIdInTxn).toHaveBeenCalledWith(ctx.manager, 'default-id');
    expect(ctx.graphRepository.incrementVersionInTxn).toHaveBeenCalledWith(ctx.manager, 'default-id');
    expect(ctx.graphRepository.deleteInTxn).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 204, etag: '"etag"' });
  });

  it('DELETE absent named graph returns 404', async () => {
    const ctx = makeService();
    ctx.graphRepository.findByIriOrDefaultInTxn.mockResolvedValue(null);

    await expect(ctx.service.deleteGraph('http://ex.org/missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects invalid target IRIs before mutating', async () => {
    const ctx = makeService();
    ctx.routing.validateIri.mockReturnValue({ valid: false, error: 'IRI must be absolute' } as any);

    await expect(
      ctx.service.putGraph('not-absolute', Buffer.from('x'), 'text/turtle'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ctx.dataSource.transaction).not.toHaveBeenCalled();
  });
});
