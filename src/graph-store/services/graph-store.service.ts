import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotAcceptableException,
  NotFoundException,
  PreconditionFailedException,
  UnsupportedMediaTypeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { DatasetMismatchException, ParseException, RdfServiceImpl } from '../../rdf/rdf.service';
import { GraphRepository, DEFAULT_GRAPH_IRI } from '../repositories/graph.repository';
import { NormalizedTriple, TripleRepository } from '../repositories/triple.repository';
import { ConcurrencyService } from './concurrency.service';
import { ContentNegotiationService } from './content-negotiation.service';
import { CANONICAL_MUTATION_FORMAT, ETagService } from './etag.service';
import { GraphRoutingService } from './graph-routing.service';
import { PatchService } from './patch.service';
import { PatchUnsupportedMediaTypeException } from '../exceptions/patch-unsupported-media-type.exception';

const QUAD_FORMATS = new Set([
  'application/trig',
  'application/n-quads',
  'application/ld+json',
]);

export interface Preconditions {
  ifMatch?: string;
  ifNoneMatch?: string;
}

export interface MultipartPart {
  buffer: Buffer;
  contentType?: string;
  filename?: string;
}

@Injectable()
export class GraphStoreService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly rdfService: RdfServiceImpl,
    private readonly routing: GraphRoutingService,
    private readonly contentNegotiation: ContentNegotiationService,
    private readonly etagService: ETagService,
    private readonly concurrency: ConcurrencyService,
    private readonly graphRepository: GraphRepository,
    private readonly tripleRepository: TripleRepository,
    private readonly configService: ConfigService,
    private readonly patchService: PatchService,
  ) {}

  async getGraph(
    iri: string | null,
    accept: string | undefined,
    ifNoneMatch?: string,
  ): Promise<{ content: string; contentType: string; etag: string; status: number }> {
    const graph = await this.graphRepository.findByIriOrDefault(iri);
    if (!graph) throw new NotFoundException('Graph not found');

    const match = this.contentNegotiation.getBestMatch(
      this.contentNegotiation.parseAccept(accept),
      this.contentNegotiation.getSupportedTypes(),
    );
    if (!match) throw new NotAcceptableException('Not Acceptable');

    const etag = this.etagService.generate(graph.id, graph.version, match.type);

    if (ifNoneMatch) {
      if (ifNoneMatch.trim() === '*') {
        return { content: '', contentType: match.type, etag, status: 304 };
      }
      const validators = ifNoneMatch.split(',');
      for (const token of validators) {
        const validator = token.trim();
        if (!validator || validator.startsWith('W/')) {
          continue;
        }
        try {
          if (this.etagService.compareStrong(validator, graph.id, graph.version, match.type)) {
            return { content: '', contentType: match.type, etag, status: 304 };
          }
        } catch {
          // Ignore malformed tokens and continue with the next validator.
        }
      }
    }

    const triples = await this.tripleRepository.findByGraphId(graph.id);
    const namedGraphIri = graph.isDefault ? null : graph.iri;
    const defaultGraphDataset = this.rdfService.triplesToDataset(triples, null);
    const content = QUAD_FORMATS.has(match.type)
      ? await this.rdfService.serializeToDataset(defaultGraphDataset, match.type, namedGraphIri)
      : await this.rdfService.serialize(defaultGraphDataset, match.type);

    return { content, contentType: match.type, etag, status: 200 };
  }

  async headGraph(
    iri: string | null,
    accept?: string,
  ): Promise<{ etag: string; contentType: string }> {
    const graph = await this.graphRepository.findByIriOrDefault(iri);
    if (!graph) throw new NotFoundException('Graph not found');

    const match = this.contentNegotiation.getBestMatch(
      this.contentNegotiation.parseAccept(accept),
      this.contentNegotiation.getSupportedTypes(),
    );
    if (!match) throw new NotAcceptableException('Not Acceptable');

    return {
      contentType: match.type,
      etag: this.etagService.generate(graph.id, graph.version, match.type),
    };
  }

  async putGraph(
    iri: string | null,
    body: Buffer,
    contentType: string,
    pre: Preconditions = {},
  ): Promise<{ status: 200 | 201 | 204; etag?: string; location?: string }> {
    const normalizedContentType = this.assertSupportedContentType(contentType);

    let targetIri: string | null = iri;
    let lockIri = DEFAULT_GRAPH_IRI;
    if (iri !== null) {
      const validation = this.routing.validateIri(iri);
      if (!validation.valid) throw new BadRequestException(validation.error);
      targetIri = validation.normalizedIri!;
      lockIri = validation.normalizedIri!;
    }

    let rows: NormalizedTriple[] = [];
    if (body.length > 0) {
      rows = await this.rdfService
        .parseWithReconciliation(body, normalizedContentType, targetIri)
        .catch((error: unknown) => {
          throw this.mapRdfError(error);
        });
    }

    return this.dataSource.transaction(async (manager) => {
      await this.concurrency.lock(manager, lockIri);
      const before = await this.graphRepository.findByIriOrDefaultInTxn(manager, targetIri);
      this.checkPreconditions(pre, before);

      if (rows.length === 0) {
        if (!before) {
          return { status: 204 };
        }

        if (before.isDefault) {
          await this.tripleRepository.deleteByGraphIdInTxn(manager, before.id);
          const version = await this.graphRepository.incrementVersionInTxn(manager, before.id);
          return {
            status: 204,
            etag: this.etagService.generate(before.id, version, CANONICAL_MUTATION_FORMAT),
          };
        }

        await this.graphRepository.deleteInTxn(manager, before.id);
        return { status: 204 };
      }

      const existed = !!before;
      let graphId: string;
      if (before) {
        graphId = before.id;
        await this.tripleRepository.deleteByGraphIdInTxn(manager, graphId);
      } else {
        const created = await this.graphRepository.createInTxn(manager, targetIri!);
        graphId = created.id;
      }

      await this.tripleRepository.insertInTxn(manager, graphId, rows);
      const version = await this.graphRepository.incrementVersionInTxn(manager, graphId);

      return {
        status: existed ? 200 : 201,
        etag: this.etagService.generate(graphId, version, CANONICAL_MUTATION_FORMAT),
        location: existed ? undefined : targetIri!,
      };
    });
  }

  async postGraph(
    body: Buffer,
    contentType: string,
    targetIri?: string | null,
    parts?: MultipartPart[],
  ): Promise<{ status: 200 | 201 | 204; etag?: string; location?: string }> {
    const hasTarget = targetIri !== undefined;
    const reconciliationTarget = hasTarget ? (targetIri as string | null) : null;

    let incoming: NormalizedTriple[];
    if (parts && parts.length > 0) {
      incoming = (
        await Promise.all(parts.map(async (part) => {
          const partContentType = this.normalizePartContentType(part);
          return this.rdfService
            .parseWithReconciliation(part.buffer, partContentType, reconciliationTarget)
            .catch((error: unknown) => {
              throw this.mapRdfError(error);
            });
        }))
      ).flat();
    } else {
      const normalizedContentType = this.assertSupportedContentType(contentType);
      if (!body || body.length === 0) {
        return { status: 204 };
      }

      incoming = await this.rdfService
        .parseWithReconciliation(body, normalizedContentType, reconciliationTarget)
        .catch((error: unknown) => {
          throw this.mapRdfError(error);
        });
    }

    if (incoming.length === 0) {
      return { status: 204 };
    }

    if (hasTarget) {
      let normalizedTarget = targetIri as string | null;
      let lockIri = DEFAULT_GRAPH_IRI;
      if (targetIri !== null) {
        const validation = this.routing.validateIri(targetIri as string);
        if (!validation.valid) throw new BadRequestException(validation.error);
        normalizedTarget = validation.normalizedIri!;
        lockIri = validation.normalizedIri!;
      }

      return this.dataSource.transaction(async (manager) => {
        await this.concurrency.lock(manager, lockIri);
        const graph = await this.graphRepository.findByIriOrDefaultInTxn(manager, normalizedTarget);
        if (!graph) throw new NotFoundException('Graph not found');

        const existing = await this.tripleRepository.findByGraphIdInTxn(manager, graph.id);
        const merged = this.rdfService.mergeNormalized(existing, incoming);
        await this.tripleRepository.deleteByGraphIdInTxn(manager, graph.id);
        await this.tripleRepository.insertInTxn(manager, graph.id, merged);
        const version = await this.graphRepository.incrementVersionInTxn(manager, graph.id);
        return {
          status: 200,
          etag: this.etagService.generate(graph.id, version, CANONICAL_MUTATION_FORMAT),
        };
      });
    }

    const mintedIri = `${this.getBaseUrl()}/graphs/${randomUUID()}`;
    return this.dataSource.transaction(async (manager) => {
      const graph = await this.graphRepository.createInTxn(manager, mintedIri);
      await this.tripleRepository.insertInTxn(manager, graph.id, incoming);
      const version = await this.graphRepository.incrementVersionInTxn(manager, graph.id);
      return {
        status: 201,
        location: mintedIri,
        etag: this.etagService.generate(graph.id, version, CANONICAL_MUTATION_FORMAT),
      };
    });
  }

  /**
   * PATCH: incremental modification via SPARQL 1.1 Update.
   * iri === null targets the default graph (?default, D-2).
   * Check order follows OQ-14: existence → If-Match present → content-type →
   * parse/scope → (in-txn) state compare → apply → version.
   */
  async patchGraph(
    iri: string | null,
    body: string,
    contentType: string,
    ifMatch?: string,
  ): Promise<{ status: 200; etag: string }> {
    let targetIri: string | null = iri;
    let lockIri: string = DEFAULT_GRAPH_IRI;
    if (iri !== null) {
      const v = this.routing.validateIri(iri);
      if (!v.valid) throw new BadRequestException(v.error);
      targetIri = v.normalizedIri!;
      lockIri = v.normalizedIri!;
    }

    // ── 1. EXISTENCE (OQ-14: must precede all other checks) ──────────────────
    // The default-graph row is always present (OQ-13), so a default-graph PATCH
    // always clears this gate.
    const existsBeforeLock = await this.graphRepository.findByIriOrDefault(targetIri);
    if (!existsBeforeLock) throw new NotFoundException('graph not found');

    // ── 2. PRECONDITION PRESENT ───────────────────────────────────────────────
    if (!ifMatch) {
      throw new HttpException('If-Match required', HttpStatus.PRECONDITION_REQUIRED);
    }

    // ── 3. CONTENT-TYPE ───────────────────────────────────────────────────────
    if (contentType !== 'application/sparql-update') {
      throw new PatchUnsupportedMediaTypeException();
    }

    // ── 4. PARSE & SCOPE ──────────────────────────────────────────────────────
    const parseResult = this.patchService.validate(body);
    if (!parseResult.valid) {
      throw new BadRequestException(`Invalid SPARQL Update: ${parseResult.error}`);
    }
    const parsed = this.patchService.parse(body);
    const scopeResult = this.patchService.scopeToGraph(parsed.operations, targetIri);
    if (!scopeResult.valid) {
      throw new UnprocessableEntityException(scopeResult.error);
    }

    // ── 5. ATOMIC CAS ─────────────────────────────────────────────────────────
    return this.dataSource.transaction(async (m) => {
      await this.concurrency.lock(m, lockIri);

      // Re-read inside the lock so we see the version that was current when locked.
      const graph = await this.graphRepository.findByIriOrDefaultInTxn(m, targetIri);
      if (!graph) throw new NotFoundException('graph not found');

      // ── 5a. STATE COMPARE ────────────────────────────────────────────────────
      if (ifMatch !== '*' && !this.etagService.compareState(ifMatch, graph.id, graph.version)) {
        throw new PreconditionFailedException('If-Match ETag does not match');
      }

      // ── 5b. APPLY (H3 fix: read through the same connection as the transaction)
      const existing = await this.tripleRepository.findByGraphIdInTxn(m, graph.id);
      const updated = await this.patchService.apply(existing, parsed, targetIri);

      await this.tripleRepository.deleteByGraphIdInTxn(m, graph.id);
      if (updated.length > 0) {
        await this.tripleRepository.insertInTxn(m, graph.id, updated);
      }

      // ── 5c. VERSION ──────────────────────────────────────────────────────────
      const newVersion = await this.graphRepository.incrementVersionInTxn(m, graph.id);

      // v3 (H1 fix): a PATCH that empties a NAMED graph deletes its row —
      // "a named graph exists iff it holds ≥ 1 triple." The default graph is
      // exempt (OQ-13): its row always survives regardless of triple count.
      if (updated.length === 0 && !graph.isDefault) {
        await this.graphRepository.deleteInTxn(m, graph.id);
      }

      return {
        status: 200 as const,
        etag: this.etagService.generate(graph.id, newVersion, CANONICAL_MUTATION_FORMAT),
      };
    });
  }

  async deleteGraph(
    iri: string | null,
    pre: Preconditions = {},
  ): Promise<{ status: 204; etag?: string }> {
    let targetIri: string | null = iri;
    let lockIri = DEFAULT_GRAPH_IRI;
    if (iri !== null) {
      const validation = this.routing.validateIri(iri);
      if (!validation.valid) throw new BadRequestException(validation.error);
      targetIri = validation.normalizedIri!;
      lockIri = validation.normalizedIri!;
    }

    return this.dataSource.transaction(async (manager) => {
      await this.concurrency.lock(manager, lockIri);
      const graph = await this.graphRepository.findByIriOrDefaultInTxn(manager, targetIri);
      if (!graph) throw new NotFoundException('Graph not found');
      this.checkPreconditions(pre, graph);

      if (graph.isDefault) {
        await this.tripleRepository.deleteByGraphIdInTxn(manager, graph.id);
        const version = await this.graphRepository.incrementVersionInTxn(manager, graph.id);
        return {
          status: 204,
          etag: this.etagService.generate(graph.id, version, CANONICAL_MUTATION_FORMAT),
        };
      }

      await this.graphRepository.deleteInTxn(manager, graph.id);
      return { status: 204 };
    });
  }

  private mapRdfError(error: unknown): never {
    if (error instanceof DatasetMismatchException || error instanceof ParseException) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }

  private assertSupportedContentType(contentType: string): string {
    const validation = this.contentNegotiation.validateContentType(contentType);
    if (!validation.valid) {
      throw new UnsupportedMediaTypeException(validation.error);
    }
    return `${validation.type}/${validation.subtype}`;
  }

  private normalizePartContentType(part: MultipartPart): string {
    if (part.contentType && part.contentType.trim().length > 0) {
      return this.assertSupportedContentType(part.contentType);
    }

    if (part.filename) {
      const filename = part.filename.toLowerCase();
      if (filename.endsWith('.ttl')) return 'text/turtle';
      if (filename.endsWith('.rdf') || filename.endsWith('.xml')) return 'application/rdf+xml';
      if (filename.endsWith('.jsonld')) return 'application/ld+json';
      if (filename.endsWith('.trig')) return 'application/trig';
      if (filename.endsWith('.nt')) return 'application/n-triples';
      if (filename.endsWith('.nq')) return 'application/n-quads';
    }

    return this.assertSupportedContentType(this.contentNegotiation.inferContentType(part.buffer));
  }

  private checkPreconditions(
    pre: Preconditions,
    current: { id: string; version: number } | null,
  ): void {
    if (pre.ifNoneMatch === '*' && current) {
      throw new PreconditionFailedException();
    }
    if (pre.ifMatch && (!current || !this.etagService.compareState(pre.ifMatch, current.id, current.version))) {
      throw new PreconditionFailedException();
    }
  }

  private getBaseUrl(): string {
    return this.configService.get<string>('GSP_BASE_URL') ?? 'http://localhost:3000';
  }
}
