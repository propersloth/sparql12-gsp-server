import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import * as crypto from 'crypto';
import { InvalidEtagException } from '../exceptions/invalid-etag.exception';

@Injectable()
export class ConcurrencyService {
  /**
   * Acquire a transaction-scoped advisory lock keyed on `iri`.
   * CONTRACT (v3, M7): `iri` MUST already be normalized — either the `normalizedIri`
   * returned by `GraphRoutingService.validateIri()`, or `DEFAULT_GRAPH_IRI`
   * (from GraphRepository) for the default graph. Passing a raw, un-normalized
   * IRI risks two spellings of the same graph locking on different keys,
   * silently defeating NFR-02. This service does not normalize internally —
   * normalization happens once, at the point `validateIri` is called, so it
   * is not redundantly re-run inside every lock acquisition.
   */
  async lock(manager: EntityManager, iri: string): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock($1)', [this.hashGraphId(iri)]);
  }

  compareVersions(ifMatchEtag: string, currentGraphId: string, currentVersion: number): boolean {
    const parsed = this.parseEtag(ifMatchEtag);
    return parsed.graphId === currentGraphId && parsed.version === currentVersion;
  }

  hashGraphId(iri: string): number {
    const buf  = crypto.createHash('sha256').update(iri).digest();
    const high = buf.readUInt32BE(0);  // 32 bits
    const low  = buf.readUInt16BE(4);  // 16 bits
    // M-02 fix: drop >>> 0. JS numbers hold 53-bit integers safely;
    // high * 65536 + low is a 48-bit value well within Number.MAX_SAFE_INTEGER.
    return high * 0x10000 + low;       // 48-bit positive integer (no Uint32 truncation)
  }

  private parseEtag(etag: string): { graphId: string; version: number; mediaType: string } {
    if (!etag.startsWith('"') || !etag.endsWith('"'))
      throw new InvalidEtagException(`ETag must be quoted: ${etag}`);
    const inner  = etag.slice(1, -1);
    const first  = inner.indexOf('.');
    const second = inner.indexOf('.', first + 1);
    if (first === -1 || second === -1)
      throw new InvalidEtagException(`ETag must have three dot-delimited components: ${etag}`);
    const graphId  = inner.substring(0, first);
    const versionS = inner.substring(first + 1, second);
    const version  = parseInt(versionS, 10);
    if (isNaN(version))
      throw new InvalidEtagException(`ETag version is not numeric: ${etag}`);
    const mediaType = inner.substring(second + 1); // percent-encoded; compareVersions ignores it
    return { graphId, version, mediaType };
  }
}
