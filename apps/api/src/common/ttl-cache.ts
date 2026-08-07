/** Small in-memory TTL cache for hot aggregates (per-process). */
export class TtlCache<T> {
  private store = new Map<string, { value: T; expires: number }>();
  private hits = 0; private misses = 0;
  constructor(private readonly ttlMs: number, private readonly now: () => number = () => Date.now()) {}

  get(key: string): T | undefined {
    const e = this.store.get(key);
    if (!e) { this.misses++; return undefined; }
    if (this.now() > e.expires) { this.store.delete(key); this.misses++; return undefined; }
    this.hits++; return e.value;
  }
  set(key: string, value: T) { this.store.set(key, { value, expires: this.now() + this.ttlMs }); }
  invalidate(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
  stats() { return { hits: this.hits, misses: this.misses, size: this.store.size }; }

  /** Return the cached value or compute+store it. Reports whether it was a hit. */
  async wrap(key: string, fn: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
    const cached = this.get(key);
    if (cached !== undefined) return { value: cached, hit: true };
    const value = await fn(); this.set(key, value); return { value, hit: false };
  }
}
