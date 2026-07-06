import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Triple } from './triple.entity';

export const DEFAULT_GRAPH_IRI = 'urn:x-arq:DefaultGraph';

function fromDatabaseVersion(value: string): number {
  const version = Number.parseInt(value, 10);

  if (Number.isNaN(version)) {
    throw new Error(`Invalid graph version value: ${value}`);
  }

  return version;
}

@Entity('graphs')
export class Graph {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', unique: true })
  iri!: string;

  @Column({
    type: 'bigint',
    default: 0,
    transformer: { to: (v: number) => v, from: fromDatabaseVersion },
  })
  version!: number;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => Triple, (triple) => triple.graph)
  triples!: Triple[];
}
