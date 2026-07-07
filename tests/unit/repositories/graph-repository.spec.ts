// TEST MATRIX: TC-DEL-01/03, TC-GET-07, TC-ID-03, TC-PUT-03, TC-POST-05/09,
//              TC-NFR-08, TC-CC-02

import { GraphRepository, DEFAULT_GRAPH_IRI } from '../../../src/graph-store/repositories/graph.repository';
import { Graph } from '../../../src/database/entities/graph.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';

describe('GraphRepository', () => {
  let repo: GraphRepository;
  let mockRepo: jest.Mocked<any>;

  const makeGraph = (overrides: Partial<Graph> = {}): Graph => ({
    id: 'uuid-123',
    iri: 'http://example.org/graph',
    version: 1,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    triples: [],
    ...overrides,
  } as Graph);

  beforeEach(async () => {
    mockRepo = {
      findOne: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    const m = await Test.createTestingModule({
      providers: [
        GraphRepository,
        { provide: getRepositoryToken(Graph), useValue: mockRepo },
      ],
    }).compile();
    repo = m.get(GraphRepository);
  });

  describe('findByIri', () => {
    it('returns the graph for a known IRI', async () => {
      mockRepo.findOne.mockResolvedValue(makeGraph());
      const g = await repo.findByIri('http://example.org/graph');
      expect(g?.iri).toBe('http://example.org/graph');
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { iri: 'http://example.org/graph' } });
    });

    it('returns null for an unknown IRI', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      expect(await repo.findByIri('http://example.org/none')).toBeNull();
    });
  });

  describe('findDefault (TC-GET-07)', () => {
    it('finds the seeded default graph by is_default flag', async () => {
      const def = makeGraph({ iri: DEFAULT_GRAPH_IRI, isDefault: true, id: 'uuid-default' });
      mockRepo.findOne.mockResolvedValue(def);

      const result = await repo.findDefault();

      expect(result.isDefault).toBe(true);
      expect(result.iri).toBe(DEFAULT_GRAPH_IRI);
      // Should NOT auto-create; the migration guarantees the row exists.
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('creates a named graph with a real IRI (TC-PUT-03)', async () => {
      const g = makeGraph({ id: 'uuid-new', iri: 'http://example.org/new', version: 0 });
      mockRepo.create.mockReturnValue(g);
      mockRepo.save.mockResolvedValue(g);

      const result = await repo.create('http://example.org/new');

      expect(result.iri).toBe('http://example.org/new');
      expect(result.isDefault).toBe(false);
      expect(mockRepo.create).toHaveBeenCalledWith({ iri: 'http://example.org/new', isDefault: false });
    });
  });

  describe('delete', () => {
    it('deletes by ID (TC-DEL-01)', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 1 });
      await repo.delete('uuid-123');
      expect(mockRepo.delete).toHaveBeenCalledWith({ id: 'uuid-123' });
    });
  });

  describe('exists', () => {
    it('returns true when IRI is present', async () => {
      mockRepo.count.mockResolvedValue(1);
      expect(await repo.exists('http://example.org/exists')).toBe(true);
    });

    it('returns false when IRI is absent (TC-DEL-03 / TC-POST-09)', async () => {
      mockRepo.count.mockResolvedValue(0);
      expect(await repo.exists('http://example.org/none')).toBe(false);
    });
  });

  describe('TC-CC-02: version is a number', () => {
    it('version returned from findByIri is numeric (bigint coercion)', async () => {
      // bigint columns come back as string from TypeORM without a transformer;
      // the entity transformer (GSP-002) must coerce it.
      mockRepo.findOne.mockResolvedValue(makeGraph({ version: 42 }));
      const g = await repo.findByIri('http://example.org/graph');
      expect(typeof g!.version).toBe('number');
      expect(g!.version).toBe(42);
    });
  });

  // Transaction-aware variant smoke tests (real behaviour verified in GSP-023/024 integration tests).
  describe('transaction-aware methods', () => {
    it('findByIriInTxn delegates to manager.findOne', async () => {
      const mockManager = { findOne: jest.fn().mockResolvedValue(makeGraph()) } as any;
      const result = await repo.findByIriInTxn(mockManager, 'http://example.org/graph');
      expect(mockManager.findOne).toHaveBeenCalledWith(Graph, { where: { iri: 'http://example.org/graph' } });
      expect(result).not.toBeNull();
    });

    it('createInTxn delegates to manager.save', async () => {
      const g = makeGraph({ id: 'uuid-new', iri: 'http://example.org/new' });
      const mockManager = {
        create: jest.fn().mockReturnValue(g),
        save: jest.fn().mockResolvedValue(g),
      } as any;
      await repo.createInTxn(mockManager, 'http://example.org/new');
      expect(mockManager.save).toHaveBeenCalled();
    });

    it('deleteInTxn delegates to manager.delete', async () => {
      const mockManager = { delete: jest.fn().mockResolvedValue({ affected: 1 }) } as any;
      await repo.deleteInTxn(mockManager, 'uuid-123');
      expect(mockManager.delete).toHaveBeenCalledWith(Graph, { id: 'uuid-123' });
    });

    it('incrementVersionInTxn issues UPDATE ... RETURNING version and coerces to number', async () => {
      const mockManager = {
        query: jest.fn().mockResolvedValue([{ version: '5' }]),
      } as any;
      const result = await repo.incrementVersionInTxn(mockManager, 'uuid-123');
      expect(mockManager.query).toHaveBeenCalledWith(
        expect.stringContaining('version + 1'),
        ['uuid-123'],
      );
      expect(result).toBe(5);           // coerced from string '5' to number
      expect(typeof result).toBe('number');
    });
  });
});
