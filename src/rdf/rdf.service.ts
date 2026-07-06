import { Injectable } from '@nestjs/common';

export interface ParsedRdfDataset {
  size: number;
}

@Injectable()
export class RdfService {
  async parse(
    _input: Buffer,
    _contentType: string,
  ): Promise<ParsedRdfDataset> {
    throw new Error('RDF parsing is not implemented yet.');
  }

  async serialize(
    _dataset: ParsedRdfDataset,
    _contentType: string,
  ): Promise<string> {
    throw new Error('RDF serialization is not implemented yet.');
  }
}
