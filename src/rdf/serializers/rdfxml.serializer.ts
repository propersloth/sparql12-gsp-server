const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
const RDF_LANG_STRING = `${RDF_NS}langString`;

export interface RdfXmlNamedNode {
  termType: 'NamedNode';
  value: string;
}

export interface RdfXmlBlankNode {
  termType: 'BlankNode';
  value: string;
}

export interface RdfXmlLiteral {
  termType: 'Literal';
  value: string;
  language?: string;
  datatype?: RdfXmlNamedNode;
}

export interface RdfXmlDefaultGraph {
  termType: 'DefaultGraph';
  value: '';
}

export type RdfXmlSubject = RdfXmlNamedNode | RdfXmlBlankNode;
export type RdfXmlObject = RdfXmlNamedNode | RdfXmlBlankNode | RdfXmlLiteral;
export type RdfXmlGraph = RdfXmlDefaultGraph | RdfXmlNamedNode | RdfXmlBlankNode;
export type RdfXmlTerm = RdfXmlSubject | RdfXmlObject | RdfXmlGraph;

export interface RdfXmlQuad {
  subject: RdfXmlSubject;
  predicate: RdfXmlNamedNode;
  object: RdfXmlObject;
  graph: RdfXmlGraph;
}

interface PredicateName {
  namespace: string;
  localName: string;
}

export function serializeRdfXml(quads: readonly RdfXmlQuad[]): string {
  const predicateNames = new Map<string, PredicateName>();
  const namespacePrefixes = new Map<string, string>([[RDF_NS, 'rdf']]);

  for (const quad of quads) {
    if (quad.graph.termType !== 'DefaultGraph') {
      throw new Error(`RDF/XML cannot serialize named graph quads: ${quad.graph.value}`);
    }

    const name = splitPredicateIri(quad.predicate.value);
    predicateNames.set(quad.predicate.value, name);

    if (!namespacePrefixes.has(name.namespace)) {
      namespacePrefixes.set(name.namespace, `ns${namespacePrefixes.size}`);
    }
  }

  const blankNodeIds = new Map<string, string>();
  let nextGeneratedBlankNodeId = 1;
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rdf:RDF',
    ...[...namespacePrefixes.entries()].map(
      ([namespace, prefix]) => `  xmlns:${prefix}="${escapeXmlAttribute(namespace)}"`,
    ),
    '>',
  ];

  for (const [, subjectQuads] of groupBySubject(quads)) {
    lines.push(
      `  <rdf:Description ${subjectAttribute(
        subjectQuads[0].subject,
        blankNodeIds,
        () => `b${nextGeneratedBlankNodeId++}`,
      )}>`,
    );
    for (const quad of subjectQuads) {
      const name = predicateNames.get(quad.predicate.value)!;
      const prefix = namespacePrefixes.get(name.namespace)!;
      lines.push(
        `    ${propertyElement(
          `${prefix}:${name.localName}`,
          quad.object,
          blankNodeIds,
          () => `b${nextGeneratedBlankNodeId++}`,
        )}`,
      );
    }
    lines.push('  </rdf:Description>');
  }

  lines.push('</rdf:RDF>', '');
  return lines.join('\n');
}

function groupBySubject(quads: readonly RdfXmlQuad[]): Map<string, RdfXmlQuad[]> {
  const groups = new Map<string, RdfXmlQuad[]>();

  for (const quad of quads) {
    const key = termToId(quad.subject);
    const group = groups.get(key);
    if (group) {
      group.push(quad);
      continue;
    }

    groups.set(key, [quad]);
  }

  return groups;
}

function termToId(term: RdfXmlTerm): string {
  switch (term.termType) {
    case 'NamedNode':
      return `<${term.value}>`;
    case 'BlankNode':
      return `_:${term.value}`;
    case 'Literal': {
      const language = term.language ? `@${term.language}` : '';
      const datatype = term.datatype ? `^^<${term.datatype.value}>` : '';
      return `"${term.value}"${language}${datatype}`;
    }
    case 'DefaultGraph':
      return 'default';
  }
}

function subjectAttribute(
  subject: RdfXmlSubject,
  blankNodeIds: Map<string, string>,
  nextBlankNodeId: () => string,
): string {
  if (subject.termType === 'NamedNode') {
    return `rdf:about="${escapeXmlAttribute(subject.value)}"`;
  }

  return `rdf:nodeID="${blankNodeId(subject, blankNodeIds, nextBlankNodeId)}"`;
}

function propertyElement(
  qname: string,
  object: RdfXmlObject,
  blankNodeIds: Map<string, string>,
  nextBlankNodeId: () => string,
): string {
  if (object.termType === 'NamedNode') {
    return `<${qname} rdf:resource="${escapeXmlAttribute(object.value)}"/>`;
  }

  if (object.termType === 'BlankNode') {
    return `<${qname} rdf:nodeID="${blankNodeId(object, blankNodeIds, nextBlankNodeId)}"/>`;
  }

  const attributes: string[] = [];
  if (object.language) {
    attributes.push(`xml:lang="${escapeXmlAttribute(object.language)}"`);
  }
  if (
    object.datatype
    && object.datatype.value !== XSD_STRING
    && object.datatype.value !== RDF_LANG_STRING
  ) {
    attributes.push(`rdf:datatype="${escapeXmlAttribute(object.datatype.value)}"`);
  }

  const suffix = attributes.length > 0 ? ` ${attributes.join(' ')}` : '';
  return `<${qname}${suffix}>${escapeXmlText(object.value)}</${qname}>`;
}

function splitPredicateIri(iri: string): PredicateName {
  for (const separator of ['#', '/']) {
    const index = iri.lastIndexOf(separator);
    if (index <= -1 || index >= iri.length - 1) {
      continue;
    }

    const namespace = iri.slice(0, index + 1);
    const localName = iri.slice(index + 1);
    if (isNcName(localName)) {
      return { namespace, localName };
    }
  }

  throw new Error(`RDF/XML predicate IRI cannot be represented as an XML QName: ${iri}`);
}

function blankNodeId(
  node: RdfXmlBlankNode,
  blankNodeIds: Map<string, string>,
  nextBlankNodeId: () => string,
): string {
  const existing = blankNodeIds.get(node.value);
  if (existing) {
    return existing;
  }

  const generated = isNcName(node.value) ? node.value : nextBlankNodeId();
  blankNodeIds.set(node.value, generated);
  return generated;
}

function escapeXmlText(value: string): string {
  assertValidXmlCharacters(value);

  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeXmlAttribute(value: string): string {
  assertValidXmlCharacters(value);

  return escapeXmlText(value)
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function assertValidXmlCharacters(value: string): void {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (!isXmlChar(codePoint)) {
      throw new Error(`RDF/XML cannot serialize XML 1.0-illegal character U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`);
    }
  }
}

function isXmlChar(codePoint: number): boolean {
  return codePoint === 0x9
    || codePoint === 0xA
    || codePoint === 0xD
    || (codePoint >= 0x20 && codePoint <= 0xD7FF)
    || (codePoint >= 0xE000 && codePoint <= 0xFFFD)
    || (codePoint >= 0x10000 && codePoint <= 0x10FFFF);
}

function isNcName(value: string): boolean {
  const characters = [...value];
  if (characters.length === 0) {
    return false;
  }

  if (!isNcNameStart(characters[0].codePointAt(0)!)) {
    return false;
  }

  return characters.slice(1).every((character) => isNcNameChar(character.codePointAt(0)!));
}

function isNcNameStart(codePoint: number): boolean {
  return (codePoint >= 0x41 && codePoint <= 0x5A)
    || codePoint === 0x5F
    || (codePoint >= 0x61 && codePoint <= 0x7A)
    || (codePoint >= 0xC0 && codePoint <= 0xD6)
    || (codePoint >= 0xD8 && codePoint <= 0xF6)
    || (codePoint >= 0xF8 && codePoint <= 0x2FF)
    || (codePoint >= 0x370 && codePoint <= 0x37D)
    || (codePoint >= 0x37F && codePoint <= 0x1FFF)
    || (codePoint >= 0x200C && codePoint <= 0x200D)
    || (codePoint >= 0x2070 && codePoint <= 0x218F)
    || (codePoint >= 0x2C00 && codePoint <= 0x2FEF)
    || (codePoint >= 0x3001 && codePoint <= 0xD7FF)
    || (codePoint >= 0xF900 && codePoint <= 0xFDCF)
    || (codePoint >= 0xFDF0 && codePoint <= 0xFFFD)
    || (codePoint >= 0x10000 && codePoint <= 0xEFFFF);
}

function isNcNameChar(codePoint: number): boolean {
  return isNcNameStart(codePoint)
    || codePoint === 0x2D
    || codePoint === 0x2E
    || (codePoint >= 0x30 && codePoint <= 0x39)
    || codePoint === 0xB7
    || (codePoint >= 0x300 && codePoint <= 0x36F)
    || (codePoint >= 0x203F && codePoint <= 0x2040);
}
