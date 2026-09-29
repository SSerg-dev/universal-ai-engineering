export type IdKind = "run" | "event" | "model" | "tool";

export interface IdGeneratorPort {
  next(kind: IdKind): string;
}
