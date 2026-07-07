import { Injectable } from '@nestjs/common';

export interface GraphTarget {
  iri: string | null;
  isDefault: boolean;
  isIndirect: boolean;
  rawIri?: string;
}

export interface ValidationResult {
  valid: boolean;
  normalizedIri?: string;
  error?: string;
}

@Injectable()
export class GraphRoutingService {
  /**
   * Resolves direct graph IRIs, indirect query-based graph IRIs, and `?default`.
   * When none of those identifiers are present, this falls back to the default
   * graph so callers can treat `/graph-store` without selection parameters as
   * the graph-store endpoint.
   */
  resolveTarget(request: {
    path?: string;
    query?: Record<string, unknown>;
    params?: Record<string, unknown>;
  }): GraphTarget {
    const directIri = this.firstString(request.params?.iri);
    if (directIri) {
      return {
        iri: directIri,
        isDefault: false,
        isIndirect: false,
        rawIri: this.extractRawIri(request.path, directIri),
      };
    }

    if (request.query && Object.hasOwn(request.query, 'default')) {
      return {
        iri: null,
        isDefault: true,
        isIndirect: false,
      };
    }

    const indirectIri = this.firstString(request.query?.graph);
    if (indirectIri) {
      return {
        iri: indirectIri,
        isDefault: false,
        isIndirect: true,
      };
    }

    return {
      iri: null,
      isDefault: true,
      isIndirect: false,
    };
  }

  validateIri(iri: string): ValidationResult {
    if (typeof iri !== 'string' || iri.length === 0) {
      return { valid: false, error: 'IRI must be a non-empty string' };
    }

    if (!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(iri)) {
      return { valid: false, error: 'IRI must be absolute and include a scheme' };
    }

    let decodedIri: string;
    try {
      decodedIri = decodeURIComponent(iri);
    } catch {
      return { valid: false, error: 'IRI contains invalid percent encoding' };
    }

    if (/[\x00-\x1F\x7F]/.test(decodedIri)) {
      return { valid: false, error: 'IRI contains control characters' };
    }

    const normalizedIri = iri.replace(
      /^([A-Za-z][A-Za-z0-9+.-]*):/,
      (_, scheme: string) => `${scheme.toLowerCase()}:`,
    );

    return { valid: true, normalizedIri };
  }

  private firstString(value: unknown): string | null {
    if (typeof value === 'string' && value.length > 0) return value;
    if (Array.isArray(value)) return this.firstString(value[0]);
    return null;
  }

  private extractRawIri(path: string | undefined, fallback: string): string {
    const prefix = '/graph/';
    if (path?.startsWith(prefix)) {
      return path.slice(prefix.length);
    }
    return fallback;
  }
}
