export type StateIdKind = "conversation" | "lease" | "run" | "operation";
export interface StateIdGeneratorPort {
  next(kind: StateIdKind): string;
}
