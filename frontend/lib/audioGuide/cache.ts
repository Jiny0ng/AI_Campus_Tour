type Entry = {
  objectUrl: string;
  bytes: number;
  lastUsedAt: number;
};

export class AudioBlobLru {
  private entries = new Map<string, Entry>();

  constructor(
    private readonly maxEntries = 32,
    private readonly maxBytes = 50 * 1024 * 1024,
  ) {}

  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    entry.lastUsedAt = Date.now();
    return entry.objectUrl;
  }

  put(key: string, blob: Blob) {
    const existing = this.entries.get(key);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing.objectUrl;
    }
    const objectUrl = URL.createObjectURL(blob);
    this.entries.set(key, { objectUrl, bytes: blob.size, lastUsedAt: Date.now() });
    this.evict();
    return objectUrl;
  }

  clear() {
    this.entries.forEach((entry) => URL.revokeObjectURL(entry.objectUrl));
    this.entries.clear();
  }

  private evict() {
    const totalBytes = () => Array.from(this.entries.values())
      .reduce((total, entry) => total + entry.bytes, 0);
    while (this.entries.size > this.maxEntries || totalBytes() > this.maxBytes) {
      const oldest = Array.from(this.entries.entries())
        .sort(([, first], [, second]) => first.lastUsedAt - second.lastUsedAt)[0];
      if (!oldest) break;
      URL.revokeObjectURL(oldest[1].objectUrl);
      this.entries.delete(oldest[0]);
    }
  }
}

