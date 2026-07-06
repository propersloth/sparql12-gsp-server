import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Graph } from './graph.entity';

@Entity('triples')
export class Triple {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ name: 'graph_id', type: 'uuid' })
  graphId!: string;

  @Column({ type: 'text' })
  subject!: string;

  @Column({ name: 'subject_type', type: 'char', length: 1 })
  subjectType!: 'U' | 'B';

  @Column({ type: 'text' })
  predicate!: string;

  @Column({ type: 'text' })
  object!: string;

  @Column({ name: 'object_type', type: 'char', length: 1 })
  objectType!: 'U' | 'L' | 'B';

  @Column({ name: 'lang_tag', type: 'text', nullable: true })
  langTag?: string;

  @Column({ type: 'text', nullable: true })
  datatype?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Graph, (graph) => graph.triples, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'graph_id' })
  graph!: Graph;
}
