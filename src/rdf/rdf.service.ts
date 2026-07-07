import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { DatasetCore, Quad as RdfQuad } from '@rdfjs/types';
import * as N3 from 'n3';
import { RdfXmlParser } from 'rdfxml-streaming-parser';
import { JsonLdParser } from 'jsonld-streaming-parser';
import jsonld from 'jsonld';
// NOTE: sparqljs is used for SPARQL Update AST parsing. The package is
// deprecated but remains the best-available option for SPARQL 1.1/1.2 parsing
// in Node.js; a migration path should be evaluated when an actively maintained
// alternative becomes available (see GSP-010 issue commentary).
import { Update, UpdateOperation, Quads, BgpPattern, GraphQuads, Triple as SparqlTriple } from 'sparqljs';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import {
  serializeRdfXml,
  RdfXmlSubject,
  RdfXmlObject,
  RdfXmlDefaultGraph,
  RdfXmlNamedNode,
} from './serializers/rdfxml.serializer';
import {
  ParseException,
  DatasetMismatchException,
  RdfXmlSerializationException,
} from './rdf.exceptions';

export {
  ParseException,
  DatasetMismatchException,
  RdfXmlSerializationException,
};

const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
const RDF_LANG_STRING = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString';

export interface NormalizedTriple {
  subject: string;
  subjectType: 'U' | 'B';
  predicate: string;
  object: string;
  objectType: 'U' | 'L' | 'B';
  langTag?: string;
  datatype?: string;
}

export interface RdfService {
  parse(data: Buffer, contentType: string): Promise<DatasetCore>;
  serialize(dataset: DatasetCore, mediaType: string): Promise<string>;
  serializeStream(dataset: DatasetCore, mediaType: string): NodeJS.ReadableStream;
  serializeToDataset(
    dataset: DatasetCore,
    mediaType: string,
    graphIri: string | null,
  ): Promise<string>;
  triplesToDataset(
    triples: NormalizedTriple[],
    graphIri: string | null,
  ): DatasetCore;
  merge(existing: DatasetCore, incoming: DatasetCore): DatasetCore;
  mergeNormalized(
    existing: NormalizedTriple[],
    incoming: NormalizedTriple[],
  ): NormalizedTriple[];
  parseWithReconciliation(
    data: Buffer,
    contentType: string,
    targetIri: string | null,
  ): Promise<NormalizedTriple[]>;
  applyPatch(
    existing: NormalizedTriple[],
    parsed: Update,
    targetIri: string | null,
  ): Promise<NormalizedTriple[]>;
}

@Injectable()
export class RdfServiceImpl implements RdfService {
  // ── Parse ──────────────────────────────────────────────────────────────────

  async parse(data: Buffer, contentType: string): Promise<DatasetCore> {
    const text = data.toString('utf-8');
    try {
      switch (contentType) {
        case 'text/turtle':
        case 'application/n-triples':
        case 'application/trig':
        case 'application/n-quads':
          return await this.parseN3(text, contentType);
        case 'application/rdf+xml':
          if (!text.trim()) {
            throw new ParseException(
              'Empty document is not valid RDF/XML',
            );
          }
          return await this.parseRdfXml(text);
        case 'application/ld+json':
          return await this.parseJsonLd(text);
        default:
          throw new ParseException(`Unsupported media type: ${contentType}`);
      }
    } catch (e) {
      if (e instanceof ParseException) throw e;
      throw new ParseException(
        `Failed to parse ${contentType}: ${(e as Error).message}`,
      );
    }
  }

  private parseN3(text: string, format: string): Promise<DatasetCore> {
    return new Promise((resolve, reject) => {
      const store = new N3.Store();
      const parser = new N3.Parser({ format });
      parser.parse(text, (error, quad) => {
        if (error) {
          reject(error);
          return;
        }
        if (quad) {
          store.add(quad);
        } else {
          resolve(store);
        }
      });
    });
  }

  private parseRdfXml(text: string): Promise<DatasetCore> {
    return new Promise((resolve, reject) => {
      const store = new N3.Store();
      const parser = new RdfXmlParser();
      parser.on('data', (quad: RdfQuad) => {
        store.add(quad as unknown as N3.Quad);
      });
      parser.on('error', (e: Error) => reject(e));
      parser.on('end', () => resolve(store));
      parser.write(text);
      parser.end();
    });
  }

  private parseJsonLd(text: string): Promise<DatasetCore> {
    return new Promise((resolve, reject) => {
      const store = new N3.Store();
      const parser = new JsonLdParser();
      parser.on('data', (quad: RdfQuad) => {
        store.add(quad as unknown as N3.Quad);
      });
      parser.on('error', (e: Error) => reject(e));
      parser.on('end', () => resolve(store));
      parser.write(text);
      parser.end();
    });
  }

  // ── Serialize ──────────────────────────────────────────────────────────────

  async serialize(dataset: DatasetCore, mediaType: string): Promise<string> {
    if (mediaType === 'application/rdf+xml') {
      return this.serializeRdfXml(dataset);
    }
    if (mediaType === 'application/ld+json') {
      return this.serializeJsonLd(dataset);
    }
    return new Promise((resolve, reject) => {
      const writer = new N3.Writer({ format: mediaType });
      for (const q of dataset) {
        writer.addQuad(q as unknown as N3.Quad);
      }
      writer.end((error: Error | null, result: string) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  }

  serializeStream(dataset: DatasetCore, mediaType: string): NodeJS.ReadableStream {
    if (mediaType === 'application/ld+json' || mediaType === 'application/rdf+xml') {
      const readable = new Readable({ read() {} });
      this.serialize(dataset, mediaType)
        .then((str) => {
          readable.push(str);
          readable.push(null);
        })
        .catch((e: Error) => readable.destroy(e));
      return readable;
    }
    const writer = new N3.StreamWriter({ format: mediaType });
    for (const q of dataset) {
      writer.write(q as unknown as N3.Quad);
    }
    writer.end();
    return writer;
  }

  async serializeToDataset(
    dataset: DatasetCore,
    mediaType: string,
    graphIri: string | null,
  ): Promise<string> {
    const df = N3.DataFactory;
    const graphTerm = graphIri ? df.namedNode(graphIri) : df.defaultGraph();
    const store = new N3.Store();
    for (const q of dataset) {
      store.add(
        df.quad(
          q.subject as unknown as N3.NamedNode | N3.BlankNode,
          q.predicate as unknown as N3.NamedNode,
          q.object as unknown as N3.NamedNode | N3.BlankNode | N3.Literal,
          graphTerm,
        ),
      );
    }
    return this.serialize(store, mediaType);
  }

  private serializeRdfXml(dataset: DatasetCore): Promise<string> {
    try {
      const defaultGraph: RdfXmlDefaultGraph = { termType: 'DefaultGraph', value: '' };
      const quads = [...dataset].map((q) => ({
        subject: q.subject as unknown as RdfXmlSubject,
        predicate: q.predicate as unknown as RdfXmlNamedNode,
        object: q.object as unknown as RdfXmlObject,
        graph: defaultGraph,
      }));
      return Promise.resolve(serializeRdfXml(quads));
    } catch (e) {
      return Promise.reject(
        new RdfXmlSerializationException((e as Error).message),
      );
    }
  }

  private async serializeJsonLd(dataset: DatasetCore): Promise<string> {
    const nquads = await new Promise<string>((resolve, reject) => {
      const writer = new N3.Writer({ format: 'application/n-quads' });
      for (const q of dataset) {
        writer.addQuad(q as unknown as N3.Quad);
      }
      writer.end((error: Error | null, result: string) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
    const doc = await jsonld.fromRDF(nquads, { format: 'application/n-quads' });
    return JSON.stringify(doc, null, 2);
  }

  // ── Row ↔ Dataset ──────────────────────────────────────────────────────────

  triplesToDataset(
    triples: NormalizedTriple[],
    graphIri: string | null,
  ): DatasetCore {
    const df = N3.DataFactory;
    const graphTerm = graphIri ? df.namedNode(graphIri) : df.defaultGraph();
    const store = new N3.Store();

    for (const t of triples) {
      const subject =
        t.subjectType === 'B'
          ? df.blankNode(t.subject)
          : df.namedNode(t.subject);

      const predicate = df.namedNode(t.predicate);

      let object: N3.Term;
      if (t.objectType === 'B') {
        object = df.blankNode(t.object);
      } else if (t.objectType === 'L') {
        if (t.langTag) {
          object = df.literal(t.object, t.langTag);
        } else if (t.datatype) {
          object = df.literal(t.object, df.namedNode(t.datatype));
        } else {
          object = df.literal(t.object);
        }
      } else {
        object = df.namedNode(t.object);
      }

      store.add(df.quad(subject, predicate, object, graphTerm));
    }

    return store;
  }

  // ── Merge ──────────────────────────────────────────────────────────────────

  merge(existing: DatasetCore, incoming: DatasetCore): DatasetCore {
    const df = N3.DataFactory;
    const store = new N3.Store();

    for (const q of existing) {
      store.add(q as unknown as N3.Quad);
    }

    const bnodeMap = new Map<string, string>();
    for (const q of incoming) {
      const subject = remapBnode(
        q.subject as unknown as N3.Term,
        bnodeMap,
        df,
      ) as N3.NamedNode | N3.BlankNode;
      const object = remapBnode(
        q.object as unknown as N3.Term,
        bnodeMap,
        df,
      ) as N3.NamedNode | N3.BlankNode | N3.Literal;
      store.add(
        df.quad(
          subject,
          q.predicate as unknown as N3.NamedNode,
          object,
          q.graph as unknown as N3.DefaultGraph | N3.NamedNode,
        ),
      );
    }

    return store;
  }

  mergeNormalized(
    existing: NormalizedTriple[],
    incoming: NormalizedTriple[],
  ): NormalizedTriple[] {
    const seen = new Set<string>(existing.map(tripleKey));
    const result = [...existing];
    for (const t of incoming) {
      const k = tripleKey(t);
      if (!seen.has(k)) {
        seen.add(k);
        result.push(t);
      }
    }
    return result;
  }

  // ── Reconciliation ─────────────────────────────────────────────────────────

  async parseWithReconciliation(
    data: Buffer,
    contentType: string,
    targetIri: string | null,
  ): Promise<NormalizedTriple[]> {
    const ds = await this.parse(data, contentType);

    for (const q of ds) {
      if (q.graph.termType !== 'DefaultGraph') {
        const graphIri = q.graph.value;
        if (targetIri === null || graphIri !== targetIri) {
          throw new DatasetMismatchException(
            `Payload contains triples in named graph <${graphIri}>, but target is ${
              targetIri === null ? 'default graph' : `<${targetIri}>`
            }`,
          );
        }
      }
    }

    const bnodeMap = new Map<string, string>();
    const result: NormalizedTriple[] = [];

    for (const q of ds) {
      const subjectValue =
        q.subject.termType === 'BlankNode'
          ? getSkolemLabel(q.subject.value, bnodeMap)
          : q.subject.value;
      const subjectType: 'U' | 'B' =
        q.subject.termType === 'BlankNode' ? 'B' : 'U';

      const predicate = q.predicate.value;

      let object: string;
      let objectType: 'U' | 'L' | 'B';
      let langTag: string | undefined;
      let datatype: string | undefined;

      if (q.object.termType === 'BlankNode') {
        object = getSkolemLabel(q.object.value, bnodeMap);
        objectType = 'B';
      } else if (q.object.termType === 'Literal') {
        object = q.object.value;
        objectType = 'L';
        const lit = q.object as unknown as N3.Literal;
        if (lit.language) {
          langTag = lit.language;
        } else if (
          lit.datatype?.value &&
          lit.datatype.value !== XSD_STRING &&
          lit.datatype.value !== RDF_LANG_STRING
        ) {
          datatype = lit.datatype.value;
        }
      } else {
        object = q.object.value;
        objectType = 'U';
      }

      const triple: NormalizedTriple = {
        subject: subjectValue,
        subjectType,
        predicate,
        object,
        objectType,
      };
      if (langTag !== undefined) triple.langTag = langTag;
      if (datatype !== undefined) triple.datatype = datatype;

      result.push(triple);
    }

    return result;
  }

  // ── PATCH application ──────────────────────────────────────────────────────

  async applyPatch(
    existing: NormalizedTriple[],
    parsed: Update,
    targetIri: string | null,
  ): Promise<NormalizedTriple[]> {
    let result = [...existing];

    for (const update of parsed.updates) {
      if (!isInsertDeleteOperation(update)) {
        throw new UnprocessableEntityException(
          `Unsupported SPARQL management operation`,
        );
      }
      if (update.updateType === 'insert') {
        const triples = this.extractTriples(update.insert, targetIri);
        result = this.mergeNormalized(result, triples);
      } else if (update.updateType === 'delete') {
        const triples = this.extractTriples(update.delete, targetIri);
        result = deleteTriples(result, triples);
      } else {
        throw new UnprocessableEntityException(
          `Unsupported SPARQL update type: ${update.updateType}`,
        );
      }
    }

    return result;
  }

  private extractTriples(
    quads: Quads[],
    targetIri: string | null,
  ): NormalizedTriple[] {
    const result: NormalizedTriple[] = [];

    for (const q of quads) {
      if (isBgpPattern(q)) {
        for (const t of q.triples) {
          result.push(sparqlTripleToNormalized(t));
        }
      } else if (isGraphQuads(q)) {
        if (
          targetIri !== null &&
          q.name.termType === 'NamedNode' &&
          q.name.value === targetIri
        ) {
          for (const t of q.triples) {
            result.push(sparqlTripleToNormalized(t));
          }
        }
      }
    }

    return result;
  }
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function remapBnode(
  term: N3.Term,
  bnodeMap: Map<string, string>,
  df: typeof N3.DataFactory,
): N3.Term {
  if (term.termType !== 'BlankNode') return term;
  const existing = bnodeMap.get(term.value);
  if (existing) return df.blankNode(existing);
  const fresh = `genid-${randomUUID()}`;
  bnodeMap.set(term.value, fresh);
  return df.blankNode(fresh);
}

function getSkolemLabel(
  originalLabel: string,
  bnodeMap: Map<string, string>,
): string {
  const existing = bnodeMap.get(originalLabel);
  if (existing) return existing;
  const fresh = `genid-${randomUUID()}`;
  bnodeMap.set(originalLabel, fresh);
  return fresh;
}

function tripleKey(t: NormalizedTriple): string {
  return `${t.subjectType}|${t.subject}|${t.predicate}|${t.objectType}|${t.object}|${t.langTag ?? ''}|${t.datatype ?? ''}`;
}

function deleteTriples(
  existing: NormalizedTriple[],
  toDelete: NormalizedTriple[],
): NormalizedTriple[] {
  const deleteKeys = new Set<string>(toDelete.map(tripleKey));
  return existing.filter((t) => !deleteKeys.has(tripleKey(t)));
}

function isBgpPattern(q: Quads): q is BgpPattern {
  return q.type === 'bgp';
}

function isGraphQuads(q: Quads): q is GraphQuads {
  return q.type === 'graph';
}

function isInsertDeleteOperation(
  op: UpdateOperation,
): op is Extract<
  UpdateOperation,
  { updateType: 'insert' | 'delete' | 'insertdelete' | 'deletewhere' }
> {
  return 'updateType' in op;
}

function sparqlTripleToNormalized(t: SparqlTriple): NormalizedTriple {
  const subjectType: 'U' | 'B' = t.subject.termType === 'BlankNode' ? 'B' : 'U';

  // Predicates in INSERT/DELETE DATA are always IRIs (not paths or variables)
  const predicateIri = t.predicate as { termType: string; value: string };

  let object: string;
  let objectType: 'U' | 'L' | 'B';
  let langTag: string | undefined;
  let datatype: string | undefined;

  const obj = t.object as {
    termType: string;
    value: string;
    language?: string;
    datatype?: { value: string };
  };
  if (obj.termType === 'BlankNode') {
    object = obj.value;
    objectType = 'B';
  } else if (obj.termType === 'Literal') {
    object = obj.value;
    objectType = 'L';
    if (obj.language) {
      langTag = obj.language;
    } else if (
      obj.datatype?.value &&
      obj.datatype.value !== XSD_STRING &&
      obj.datatype.value !== RDF_LANG_STRING
    ) {
      datatype = obj.datatype.value;
    }
  } else {
    object = obj.value;
    objectType = 'U';
  }

  const triple: NormalizedTriple = {
    subject: t.subject.value,
    subjectType,
    predicate: predicateIri.value,
    object,
    objectType,
  };
  if (langTag !== undefined) triple.langTag = langTag;
  if (datatype !== undefined) triple.datatype = datatype;

  return triple;
}


