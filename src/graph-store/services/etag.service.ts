import { Injectable } from '@nestjs/common';

@Injectable()
export class ETagService {
  generate(graphId: string, version: number, mediaType: string): string {
    return `"${graphId}.${version}.${encodeURIComponent(mediaType)}"`;
  }
}
