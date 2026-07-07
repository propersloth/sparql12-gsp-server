import {
  type RdfXmlDefaultGraph,
  serializeRdfXml,
} from '../../../src/rdf/serializers/rdfxml.serializer';

const defaultGraph: RdfXmlDefaultGraph = { termType: 'DefaultGraph', value: '' };

describe('serializeRdfXml', () => {
  it('serializes a blank-node subject shared with a blank-node object', () => {
    const xml = serializeRdfXml([
      {
        subject: { termType: 'NamedNode', value: 'http://example.org/s' },
        predicate: { termType: 'NamedNode', value: 'http://example.org/predicate' },
        object: { termType: 'BlankNode', value: 'genid-shared' },
        graph: defaultGraph,
      },
      {
        subject: { termType: 'BlankNode', value: 'genid-shared' },
        predicate: { termType: 'NamedNode', value: 'http://example.org/q' },
        object: { termType: 'Literal', value: 'value' },
        graph: defaultGraph,
      },
    ]);

    expect(xml).toContain('<ns1:predicate rdf:nodeID="genid-shared"/>');
    expect(xml).toContain('<rdf:Description rdf:nodeID="genid-shared">');
  });

  it('rejects predicate IRIs that cannot be represented as XML QNames', () => {
    expect(() =>
      serializeRdfXml([
        {
          subject: { termType: 'NamedNode', value: 'http://example.org/s' },
          predicate: { termType: 'NamedNode', value: 'http://example.org/vocab/prefix-only/' },
          object: { termType: 'Literal', value: 'value' },
          graph: defaultGraph,
        },
      ]),
    ).toThrow('RDF/XML predicate IRI cannot be represented as an XML QName');
  });

  it('rejects XML 1.0-illegal literal characters', () => {
    expect(() =>
      serializeRdfXml([
        {
          subject: { termType: 'NamedNode', value: 'http://example.org/s' },
          predicate: { termType: 'NamedNode', value: 'http://example.org/predicate' },
          object: { termType: 'Literal', value: 'bad\u0001char' },
          graph: defaultGraph,
        },
      ]),
    ).toThrow('RDF/XML cannot serialize XML 1.0-illegal character');
  });

  it('accepts astral-plane NCName local parts', () => {
    const xml = serializeRdfXml([
      {
        subject: { termType: 'NamedNode', value: 'http://example.org/s' },
        predicate: { termType: 'NamedNode', value: 'http://example.org/ns/😀name' },
        object: { termType: 'Literal', value: 'value' },
        graph: defaultGraph,
      },
    ]);

    expect(xml).toContain('<ns1:😀name>value</ns1:😀name>');
  });
});
