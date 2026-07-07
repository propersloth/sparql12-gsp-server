import { Injectable } from '@nestjs/common';
import { Parser as SparqlParser } from 'sparqljs';
import type { Update } from 'sparqljs';
import { RdfServiceImpl, NormalizedTriple } from '../../rdf/rdf.service';

@Injectable()
export class PatchService {
  constructor(private readonly rdf: RdfServiceImpl) {}

  validate(patch: string): { valid: boolean; error?: string } {
    try {
      new SparqlParser().parse(patch);
      return { valid: true };
    } catch (e) {
      return { valid: false, error: (e as Error).message };
    }
  }

  parse(patch: string): { operations: any[]; prefixes: Record<string, string>; raw: Update } {
    const parsed = new SparqlParser().parse(patch) as any;
    return {
      operations: (parsed.updates ?? []) as any[],
      prefixes: (parsed.prefixes ?? {}) as Record<string, string>,
      raw: parsed as Update,
    };
  }

  /**
   * Validates that all graph references in the parsed AST match the target.
   * targetIri === null means the default graph — any GRAPH-scoped clause is out of scope
   * since default-graph data is written without a GRAPH wrapper.
   */
  scopeToGraph(operations: any[], targetIri: string | null): { valid: boolean; error?: string } {
    const targetDisplay = targetIri ?? '(default)';
    for (const op of operations) {
      // WITH clause names a graph (sparqljs uses op.graph for the WITH subject)
      if (op.graph && (targetIri === null || op.graph.value !== targetIri)) {
        return {
          valid: false,
          error: `PATCH WITH clause names <${op.graph.value}>; target is ${targetDisplay}`,
        };
      }
      // Check all patterns in insert, delete, and where for graph-scoped clauses.
      // sparqljs represents GRAPH {} blocks as { type: 'graph', name: NamedNode, ... }.
      const allPatterns: any[] = [
        ...(Array.isArray(op.insert) ? op.insert : []),
        ...(Array.isArray(op.delete) ? op.delete : []),
        ...(Array.isArray(op.where) ? op.where : []),
      ];
      for (const pattern of allPatterns) {
        if (pattern?.type === 'graph') {
          const graphIri: string | undefined = pattern.name?.value;
          if (graphIri !== undefined && (targetIri === null || graphIri !== targetIri)) {
            return {
              valid: false,
              error: `PATCH references graph <${graphIri}>; target is ${targetDisplay}`,
            };
          }
        }
      }
    }
    return { valid: true };
  }

  async apply(
    existing: NormalizedTriple[],
    parsed: { raw: Update },
    targetIri: string | null,
  ): Promise<NormalizedTriple[]> {
    return this.rdf.applyPatch(existing, parsed.raw, targetIri);
  }
}
