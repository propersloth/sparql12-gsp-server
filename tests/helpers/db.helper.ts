import { DataSource } from 'typeorm';

export async function verifyPersistence(
  dataSource: DataSource,
  verificationFn: (data: DataSource) => Promise<boolean>,
): Promise<boolean> {
  const beforeRestart = await verificationFn(dataSource);
  await dataSource.destroy();
  await dataSource.initialize();
  const afterRestart = await verificationFn(dataSource);
  return beforeRestart === afterRestart;
}

export async function runConcurrentWrites<T>(
  operations: Array<() => Promise<T>>,
  maxConcurrent = 2,
): Promise<Array<{ success: boolean; result?: T; error?: unknown }>> {
  const results: Array<{ success: boolean; result?: T; error?: unknown }> = [];
  const chunks = chunkArray(operations, maxConcurrent);

  for (const chunk of chunks) {
    const chunkResults = await Promise.allSettled(
      chunk.map((operation) =>
        operation().then((result) => ({ success: true, result })),
      ),
    );

    chunkResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({ success: false, error: result.reason });
      }
    });
  }

  return results;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < arr.length; index += size) {
    chunks.push(arr.slice(index, index + size));
  }

  return chunks;
}
