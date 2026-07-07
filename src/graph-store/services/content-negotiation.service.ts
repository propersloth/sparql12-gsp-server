import { Injectable } from '@nestjs/common';

export interface AcceptEntry {
  type: string;
  subtype: string;
  quality: number;
  params: Record<string, string>;
  raw: string;
}

export interface MatchResult {
  type: string;
  quality: number;
}

export interface ContentTypeValidation {
  valid: boolean;
  type?: string;
  subtype?: string;
  charset?: string;
  error?: string;
}

@Injectable()
export class ContentNegotiationService {
  /**
   * Inspect only the first 512 bytes when inferring a missing Content-Type so
   * detection stays cheap while still covering the leading syntax markers.
   */
  private static readonly CONTENT_DETECTION_BUFFER_SIZE = 512;

  private readonly supportedTypes = [
    'text/turtle',
    'application/rdf+xml',
    'application/ld+json',
    'application/trig',
    'application/n-triples',
    'application/n-quads',
  ] as const;

  parseAccept(accept: string | undefined): AcceptEntry[] {
    if (!accept || accept.trim().length === 0) {
      return [{ type: '*', subtype: '*', quality: 1, params: {}, raw: '*/*' }];
    }

    const entries = accept
      .split(',')
      .map((part, index) => this.parseAcceptPart(part, index))
      .filter((entry): entry is AcceptEntry & { index: number } => entry !== null)
      .sort(
        (a, b) =>
          (b.quality - a.quality) ||
          (this.acceptSpecificity(b) - this.acceptSpecificity(a)) ||
          (a.index - b.index),
      )
      .map(({ index, ...entry }) => entry);

    return entries.length > 0
      ? entries
      : [{ type: '*', subtype: '*', quality: 1, params: {}, raw: '*/*' }];
  }

  getBestMatch(parsed: AcceptEntry[], supported: string[]): MatchResult | null {
    const supportedTypes = supported.length > 0 ? supported : [...this.supportedTypes];

    for (const entry of parsed) {
      if (entry.quality <= 0) continue;

      if (entry.type === '*' && entry.subtype === '*') {
        return { type: supportedTypes[0], quality: entry.quality };
      }

      if (entry.subtype === '*') {
        const typePrefix = `${entry.type.toLowerCase()}/`;
        const subtypeMatch = supportedTypes.find((candidate) =>
          candidate.toLowerCase().startsWith(typePrefix),
        );
        if (subtypeMatch) {
          return { type: subtypeMatch, quality: entry.quality };
        }
        continue;
      }

      const exact = `${entry.type}/${entry.subtype}`.toLowerCase();
      const exactMatch = supportedTypes.find((candidate) => candidate.toLowerCase() === exact);
      if (exactMatch) {
        return { type: exactMatch, quality: entry.quality };
      }
    }

    return null;
  }

  validateContentType(contentType: string): ContentTypeValidation {
    if (!contentType || contentType.trim().length === 0) {
      return { valid: false, error: 'Content-Type is required' };
    }

    const [mediaType, ...paramParts] = contentType.split(';').map((part) => part.trim());
    const [type, subtype] = mediaType.split('/');
    if (!type || !subtype) {
      return { valid: false, error: 'Invalid Content-Type format' };
    }

    const normalized = `${type.toLowerCase()}/${subtype.toLowerCase()}`;
    const supported = this.supportedTypes.find((candidate) => candidate === normalized);
    if (!supported) {
      return { valid: false, error: `Unsupported Content-Type: ${normalized}` };
    }

    const result: ContentTypeValidation = {
      valid: true,
      type: type.toLowerCase(),
      subtype: subtype.toLowerCase(),
    };

    const charsetParam = paramParts.find((param) => param.toLowerCase().startsWith('charset='));
    if (charsetParam) {
      result.charset = charsetParam.split('=')[1]?.trim().replace(/^"|"$/g, '');
    }

    return result;
  }

  inferContentType(body: Buffer): string {
    const snippet = body
      .toString('utf-8', 0, ContentNegotiationService.CONTENT_DETECTION_BUFFER_SIZE)
      .trimStart();
    if (snippet.length === 0) return 'application/rdf+xml';

    if (snippet.startsWith('@prefix') || snippet.startsWith('@base')) {
      return 'text/turtle';
    }

    if (this.looksLikeNTriples(snippet)) {
      return 'application/n-triples';
    }

    if (snippet.startsWith('{') || snippet.startsWith('[')) {
      return 'application/ld+json';
    }

    return 'application/rdf+xml';
  }

  getSupportedTypes(): string[] {
    return [...this.supportedTypes];
  }

  private parseAcceptPart(part: string, index: number): (AcceptEntry & { index: number }) | null {
    const trimmed = part.trim();
    if (trimmed.length === 0) return null;

    const [mediaRange, ...paramParts] = trimmed.split(';');
    const [type, subtype] = mediaRange.split('/').map((value) => value.trim().toLowerCase());
    if (!type || !subtype) return null;

    const params: Record<string, string> = {};
    let quality = 1;

    for (const rawParam of paramParts) {
      const [rawKey, ...rawValueParts] = rawParam.split('=');
      if (!rawKey) continue;
      const key = rawKey.trim().toLowerCase();
      const value = rawValueParts.join('=').trim().replace(/^"|"$/g, '');
      if (key === 'q') {
        const parsed = Number.parseFloat(value);
        quality = Number.isNaN(parsed) ? 1 : Math.max(0, Math.min(parsed, 1));
      } else if (key.length > 0) {
        params[key] = value;
      }
    }

    return { type, subtype, quality, params, raw: trimmed, index };
  }

  private acceptSpecificity(entry: Pick<AcceptEntry, 'type' | 'subtype'>): number {
    if (entry.type === '*' && entry.subtype === '*') return 0;
    if (entry.subtype === '*') return 1;
    return 2;
  }

  private looksLikeNTriples(value: string): boolean {
    const line = value.trim();
    return /^(?:<[^>]+>|_:[A-Za-z][A-Za-z0-9]*)\s+<[^>]+>\s+(?:<[^>]+>|_:[A-Za-z][A-Za-z0-9]*|"(?:[^"\\]|\\.)*"(?:@[A-Za-z]+(?:-[A-Za-z0-9]+)*|\^\^<[^>]+>)?)\s*\.\s*$/s
      .test(line);
  }
}
