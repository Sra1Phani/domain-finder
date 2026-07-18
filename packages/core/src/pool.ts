// Bounded-concurrency map. Extracted verbatim from the worker pool that was
// inline in availability.checkMany, so both the domain path and the new
// namespace coordinator share one implementation. Order-preserving: the result
// at index i corresponds to items[i].

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    worker,
  );
  await Promise.all(workers);
  return out;
}
