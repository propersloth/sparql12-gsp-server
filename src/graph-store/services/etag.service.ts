import { Injectable } from '@nestjs/common';
import { InvalidEtagException } from '../exceptions/invalid-etag.exception';

/**
 * Format discriminator used for ETags on mutation responses (PUT/POST/PATCH),
 * which have no negotiated representation of their own to draw a format from.
 * text/turtle is the trio default (UR-GET-02) and is always independently
 * GET-able, unlike e.g. application/sparql-update (PATCH's request Content-Type,
 * which the server can never serve back) — see PATCH NOTE v2 / M3.
 */
export const CANONICAL_MUTATION_FORMAT = 'text/turtle';

export interface ParsedEtag {
  graphId: string;
  version: number;
  mediaType: string;  // decoded (no percent-encoding)
  raw: string;        // the original quoted string
}

@Injectable()
export class ETagService {

  generate(graphId: string, version: number, mediaType: string): string {
    return `"${graphId}.${version}.${encodeURIComponent(mediaType)}"`;
  }

  parse(raw: string): ParsedEtag {
    if (!raw.startsWith('"') || !raw.endsWith('"'))
      throw new InvalidEtagException(`ETag must be quoted: ${raw}`);
    const inner  = raw.slice(1, -1);
    const first  = inner.indexOf('.');
    const second = inner.indexOf('.', first + 1);
    if (first === -1 || second === -1)
      throw new InvalidEtagException(`ETag must have three dot-delimited components: ${raw}`);
    const graphId   = inner.substring(0, first);
    const versionS  = inner.substring(first + 1, second);
    if (!/^\d+$/.test(versionS)) throw new InvalidEtagException(`ETag version must be fully numeric: ${raw}`);
    const version = Number(versionS);
    if (!Number.isSafeInteger(version)) throw new InvalidEtagException(`ETag version out of range: ${raw}`);
    const encodedMediaType = inner.substring(second + 1);
    let mediaType: string;
    try {
      mediaType = decodeURIComponent(encodedMediaType);
    } catch {
      throw new InvalidEtagException(`ETag media type is not valid percent-encoding: ${raw}`);
    }
    return { graphId, version, mediaType, raw };
  }

  /** Full comparison — all three components must match (If-None-Match, → 304). */
  compareStrong(etag: string, graphId: string, version: number, mediaType: string): boolean {
    const p = this.parse(etag);
    return p.graphId === graphId && p.version === version && p.mediaType === mediaType;
  }

  /** State comparison — graphId + version only (If-Match, → 412 on mismatch). */
  compareState(etag: string, graphId: string, version: number): boolean {
    const p = this.parse(etag);
    return p.graphId === graphId && p.version === version;
  }

  /**
   * Extract the first strong ETag from an If-Match / If-None-Match header.
   * Returns null for empty input or weak ETags (W/...) — callers treat null as absent.
   * Returns '*' for the wildcard.
   */
  extractFirstEtag(header: string): string | null {
    if (!header || !header.trim()) return null;
    if (header.trim() === '*') return '*';
    const tokens = header.split(',');
    for (const token of tokens) {
      const trimmed = token.trim();
      if (/^W\//i.test(trimmed)) continue;
      const m = trimmed.match(/^"([^"]+)"$/);
      if (m) return m[0];
    }
    return null;
  }
}
