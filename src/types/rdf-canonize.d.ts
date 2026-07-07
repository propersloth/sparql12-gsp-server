declare module 'rdf-canonize' {
  export function canonize(
    dataset: unknown[],
    options: { algorithm: string },
  ): Promise<string>;
}
