import { Injectable, NotAcceptableException, NotFoundException } from '@nestjs/common';
import { GraphRepository } from '../repositories/graph.repository';
import { TripleRepository } from '../repositories/triple.repository';
import { ContentNegotiationService } from './content-negotiation.service';
import { ETagService } from './etag.service';
import { RdfService } from '../../rdf/rdf.service';

const QUAD_FORMATS = new Set([
  'application/trig',
  'application/n-quads',
  'application/ld+json',
]);

@Injectable()
export class GraphStoreService {
  constructor(
    private readonly graphRepository: GraphRepository,
    private readonly tripleRepository: TripleRepository,
    private readonly contentNegotiation: ContentNegotiationService,
    private readonly etagService: ETagService,
    private readonly rdfService: RdfService,
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

    if (ifNoneMatch && ifNoneMatch !== '*') {
      try {
        if (this.etagService.compareStrong(ifNoneMatch, graph.id, graph.version, match.type)) {
          return { content: '', contentType: match.type, etag, status: 304 };
        }
      } catch {
        // Ignore malformed If-None-Match and continue with a normal 200 response.
      }
    }

    const triples = await this.tripleRepository.findByGraphId(graph.id);
    const labelIri = graph.isDefault ? null : graph.iri;
    const dataset = this.rdfService.triplesToDataset(triples, labelIri);
    const content = QUAD_FORMATS.has(match.type)
      ? await this.rdfService.serializeToDataset(dataset, match.type, labelIri)
      : await this.rdfService.serialize(dataset, match.type);

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
}
