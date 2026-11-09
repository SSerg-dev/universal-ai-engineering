export interface ContentIdentityPort {
  // Lowercase SHA-256 hex over UTF-8 bytes of the supplied canonical string.
  digest(value: string): string;
}
