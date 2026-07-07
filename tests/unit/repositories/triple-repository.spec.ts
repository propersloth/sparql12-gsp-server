// TEST MATRIX: TC-NFR-04, TC-GET-01/02, TC-PUT-01, TC-POST-01, TC-DEL-01, TC-RDF-01

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Readable } from 'stream';
import { MoreThan } from 'typeorm';
import { Triple } from '../../../src/database/entities/triple.entity';
import { TripleRepository, type NormalizedTriple } from '../../../src/graph-store/repositories/triple.repository';

describe('TripleRepository', () => {
  let repository: TripleRepository;
  let mockRepo: jest.Mocked<any>;

  const makeSelectQueryBuilder = () => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  });

  const makeInsertQueryBuilder = () => ({
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ identifiers: [] }),
  });

  beforeEach(async () => {
    const selectQb = makeSelectQueryBuilder();
    const insertQb = makeInsertQueryBuilder();

    mockRepo = {
      createQueryBuilder: jest.fn((alias?: string) => alias ? selectQb : insertQb),
      delete: jest.fn(),
      count: jest.fn(),
      find: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TripleRepository,
        { provide: getRepositoryToken(Triple), useValue: mockRepo },
      ],
    }).compile();

    repository = moduleRef.get(TripleRepository);
  });

  describe('findByGraphId', () => {
    it('TC-GET-01: returns triples for an existing graph', async () => {
      mockRepo.createQueryBuilder('t').getMany.mockResolvedValue([
        {
          id: '1',
          graphId: 'g1',
          subject: 'http://ex.org/s',
          subjectType: 'U',
          predicate: 'http://ex.org/p',
          object: 'http://ex.org/o',
          objectType: 'U',
        },
      ]);

      const result = await repository.findByGraphId('g1');

      expect(result).toHaveLength(1);
      expect(mockRepo.createQueryBuilder).toHaveBeenCalledWith('t');
      expect(mockRepo.createQueryBuilder('t').select).toHaveBeenCalledWith([
        't.id',
        't.graphId',
        't.subject',
        't.subjectType',
        't.predicate',
        't.object',
        't.objectType',
        't.langTag',
        't.datatype',
      ]);
      expect(mockRepo.createQueryBuilder('t').where).toHaveBeenCalledWith(
        't.graph_id = :graphId',
        { graphId: 'g1' },
      );
    });

    it('TC-GET-02: returns empty array when no triples', async () => {
      mockRepo.createQueryBuilder('t').getMany.mockResolvedValue([]);
      await expect(repository.findByGraphId('empty')).resolves.toHaveLength(0);
    });

    it('TC-RDF-01: handles subject/object type-B labels without _:-prefixes', async () => {
      mockRepo.createQueryBuilder('t').getMany.mockResolvedValue([
        { subjectType: 'U', objectType: 'U', object: 'http://ex.org/o' },
        { subjectType: 'U', objectType: 'L', object: 'hello', langTag: 'en' },
        { subjectType: 'U', objectType: 'B', object: 'genid-abc123' },
        { subject: 'genid-subj456', subjectType: 'B', objectType: 'U', object: 'http://ex.org/o' },
      ]);

      const rows = await repository.findByGraphId('g1');

      expect(rows.map((row) => row.objectType)).toEqual(['U', 'L', 'B', 'U']);
      expect(rows.map((row) => row.subjectType)).toEqual(['U', 'U', 'U', 'B']);
      expect(rows[2].object).toBe('genid-abc123');
      expect(rows[2].object).not.toContain('://');
      expect(rows[2].object).not.toMatch(/^_:/);
      expect(rows[3].subject).toBe('genid-subj456');
      expect(rows[3].subject).not.toMatch(/^_:/);
    });
  });

  describe('TC-NFR-04: findByGraphIdStream returns Readable synchronously', () => {
    it('is a Readable without awaiting', () => {
      const stream = repository.findByGraphIdStream('uuid-123');
      expect(stream).toBeInstanceOf(Readable);
    });

    it('cursor stream emits rows then ends', (done) => {
      mockRepo.find
        .mockResolvedValueOnce([
          {
            id: '1',
            subject: 'http://ex.org/s',
            subjectType: 'U',
            predicate: 'http://ex.org/p',
            object: 'http://ex.org/o',
            objectType: 'U',
          },
        ])
        .mockResolvedValueOnce([]);

      const rows: Triple[] = [];

      repository.findByGraphIdStream('uuid-123', 1)
        .on('data', (row) => rows.push(row))
        .on('error', done)
        .on('end', () => {
          try {
            expect(rows).toHaveLength(1);
            expect(mockRepo.find).toHaveBeenNthCalledWith(1, {
              where: { graphId: 'uuid-123' },
              take: 1,
              order: { id: 'ASC' },
            });
            expect(mockRepo.find.mock.calls[1][0]).toEqual({
              where: { graphId: 'uuid-123', id: MoreThan('1') },
              take: 1,
              order: { id: 'ASC' },
            });
            done();
          } catch (error) {
            done(error);
          }
        });
    });
  });

  describe('insert', () => {
    const triples: NormalizedTriple[] = [
      {
        subject: 'http://ex.org/s1',
        subjectType: 'U',
        predicate: 'http://ex.org/p',
        object: 'http://ex.org/o1',
        objectType: 'U',
      },
      {
        subject: 'http://ex.org/s2',
        subjectType: 'U',
        predicate: 'http://ex.org/p',
        object: 'en literal',
        objectType: 'L',
        langTag: 'en',
      },
    ];

    it('TC-PUT-01: inserts multiple triples with ON CONFLICT DO NOTHING', async () => {
      const insertQb = mockRepo.createQueryBuilder();

      await repository.insert('g1', triples);

      expect(insertQb.insert).toHaveBeenCalled();
      expect(insertQb.into).toHaveBeenCalledWith(Triple);
      expect(insertQb.values).toHaveBeenCalledWith([
        expect.objectContaining({ graphId: 'g1', subjectType: 'U', objectType: 'U' }),
        expect.objectContaining({ graphId: 'g1', objectType: 'L', langTag: 'en' }),
      ]);
      expect(insertQb.orIgnore).toHaveBeenCalled();
      expect(insertQb.execute).toHaveBeenCalled();
    });

    it('returns without executing a query for an empty array', async () => {
      await repository.insert('g1', []);
      expect(mockRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('stores type-B object as a genid label', async () => {
      const insertQb = mockRepo.createQueryBuilder();

      await repository.insert('g1', [
        {
          subject: 'http://ex.org/s',
          subjectType: 'U',
          predicate: 'http://ex.org/p',
          object: 'genid-550e8400',
          objectType: 'B',
        },
      ]);

      expect(insertQb.values).toHaveBeenCalledWith([
        expect.objectContaining({
          objectType: 'B',
          object: 'genid-550e8400',
        }),
      ]);
    });

    it('stores type-B subject as a genid label', async () => {
      const insertQb = mockRepo.createQueryBuilder();

      await repository.insert('g1', [
        {
          subject: 'genid-subj789',
          subjectType: 'B',
          predicate: 'http://ex.org/p',
          object: 'http://ex.org/o',
          objectType: 'U',
        },
      ]);

      expect(insertQb.values).toHaveBeenCalledWith([
        expect.objectContaining({
          subjectType: 'B',
          subject: 'genid-subj789',
        }),
      ]);
    });
  });

  describe('deleteByGraphId', () => {
    it('TC-DEL-01: deletes all triples for a graph', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 3 });
      await expect(repository.deleteByGraphId('g1')).resolves.toBe(3);
      expect(mockRepo.delete).toHaveBeenCalledWith({ graphId: 'g1' });
    });

    it('returns 0 when no triples exist', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 0 });
      await expect(repository.deleteByGraphId('empty')).resolves.toBe(0);
    });
  });

  describe('transaction-aware variants', () => {
    it('insertInTxn delegates to the manager query builder with orIgnore', async () => {
      const qb = makeInsertQueryBuilder();
      const manager = { createQueryBuilder: jest.fn().mockReturnValue(qb) } as any;

      await repository.insertInTxn(manager, 'g1', [
        {
          subject: 'http://ex.org/s',
          subjectType: 'U',
          predicate: 'http://ex.org/p',
          object: 'http://ex.org/o',
          objectType: 'U',
        },
      ]);

      expect(manager.createQueryBuilder).toHaveBeenCalledWith();
      expect(qb.into).toHaveBeenCalledWith(Triple);
      expect(qb.orIgnore).toHaveBeenCalled();
    });

    it('deleteByGraphIdInTxn delegates to manager.delete', async () => {
      const manager = { delete: jest.fn().mockResolvedValue({ affected: 2 }) } as any;
      await expect(repository.deleteByGraphIdInTxn(manager, 'g1')).resolves.toBe(2);
      expect(manager.delete).toHaveBeenCalledWith(Triple, { graphId: 'g1' });
    });

    it('findByGraphIdInTxn reads through the manager, not the standalone repo', async () => {
      const qb = makeSelectQueryBuilder();
      qb.getMany.mockResolvedValue([
        {
          id: '1',
          subject: 'http://ex.org/s',
          subjectType: 'U',
          predicate: 'http://ex.org/p',
          object: 'http://ex.org/o',
          objectType: 'U',
        },
      ]);
      const manager = { createQueryBuilder: jest.fn().mockReturnValue(qb) } as any;

      const rows = await repository.findByGraphIdInTxn(manager, 'g1');

      expect(manager.createQueryBuilder).toHaveBeenCalledWith(Triple, 't');
      expect(rows).toHaveLength(1);
      expect(mockRepo.createQueryBuilder).not.toHaveBeenCalledWith('t');
    });
  });
});
