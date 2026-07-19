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

/**
 * Run `thunks` with bounded concurrency and yield each result **in completion
 * order** — the fastest-settling first, regardless of input order. Unlike
 * mapPool (which awaits the whole batch and preserves input order), this drains
 * as each promise settles, so a consumer sees fast results immediately.
 *
 * Tags each in-flight promise with its id, races the active set, yields the
 * settled one, and launches the next — keeping at most `concurrency` in flight.
 * Rejections propagate (callers whose thunks never reject — e.g. providers that
 * catch internally — get a clean stream).
 */
export async function* streamSettled<T>(
  thunks: Array<() => Promise<T>>,
  concurrency: number,
): AsyncGenerator<T> {
  let next = 0;
  const active = new Map<number, Promise<{ id: number; value: T }>>();

  const launch = () => {
    if (next >= thunks.length) return;
    const id = next++;
    active.set(
      id,
      thunks[id]().then((value) => ({ id, value })),
    );
  };

  const start = Math.min(Math.max(concurrency, 1), thunks.length);
  for (let i = 0; i < start; i++) launch();

  while (active.size > 0) {
    const { id, value } = await Promise.race(active.values());
    active.delete(id);
    yield value;
    launch();
  }
}
