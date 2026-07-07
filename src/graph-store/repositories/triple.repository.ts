import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Readable } from 'stream';
import { EntityManager, Repository } from 'typeorm';
import { Triple } from '../../database/entities/triple.entity';
import type { NormalizedTriple } from '../../rdf/rdf.service';

export type { NormalizedTriple } from '../../rdf/rdf.service';

@Injectable()
export class TripleRepository {
  constructor(
    @InjectRepository(Triple)
    private readonly repo: Repository<Triple>,
  ) {}

  async findByGraphId(graphId: string): Promise<Triple[]> {
    return this.repo.createQueryBuilder('t')
      .select(['t.id', 't.subject', 't.subjectType', 't.predicate', 't.object', 't.objectType', 't.langTag', 't.datatype'])
      .where('t.graph_id = :graphId', { graphId })
      .getMany();
  }

  // Callers with an open transaction must read through the provided manager so
  // they reuse the transaction's connection instead of drawing a second one.
  async findByGraphIdInTxn(m: EntityManager, graphId: string): Promise<Triple[]> {
    return m.createQueryBuilder(Triple, 't')
      .select(['t.id', 't.subject', 't.subjectType', 't.predicate', 't.object', 't.objectType', 't.langTag', 't.datatype'])
      .where('t.graph_id = :graphId', { graphId })
      .getMany();
  }

  findByGraphIdStream(graphId: string, batchSize = 1000): Readable {
    const self = this;
    let offset = 0;
    let done = false;

    return new Readable({
      objectMode: true,
      async read() {
        if (done) {
          this.push(null);
          return;
        }

        try {
          const batch = await self.repo.find({
            where: { graphId },
            skip: offset,
            take: batchSize,
            order: { id: 'ASC' },
          });

          if (batch.length === 0) {
            done = true;
            this.push(null);
            return;
          }

          for (const row of batch) {
            this.push(row);
          }

          offset += batch.length;
          if (batch.length < batchSize) {
            done = true;
            this.push(null);
          }
        } catch (error) {
          this.destroy(error as Error);
        }
      },
    });
  }

  async insert(graphId: string, triples: NormalizedTriple[]): Promise<void> {
    if (triples.length === 0) return;

    await this.repo
      .createQueryBuilder()
      .insert()
      .into(Triple)
      .values(triples.map((triple) => ({ graphId, ...triple })))
      .orIgnore()
      .execute();
  }

  async insertInTxn(m: EntityManager, graphId: string, triples: NormalizedTriple[]): Promise<void> {
    if (triples.length === 0) return;

    await m
      .createQueryBuilder()
      .insert()
      .into(Triple)
      .values(triples.map((triple) => ({ graphId, ...triple })))
      .orIgnore()
      .execute();
  }

  async deleteByGraphId(graphId: string): Promise<number> {
    const result = await this.repo.delete({ graphId });
    return result.affected ?? 0;
  }

  async countByGraphId(graphId: string): Promise<number> {
    return this.repo.count({ where: { graphId } });
  }

  async deleteByGraphIdInTxn(m: EntityManager, graphId: string): Promise<number> {
    const result = await m.delete(Triple, { graphId });
    return result.affected ?? 0;
  }
}
