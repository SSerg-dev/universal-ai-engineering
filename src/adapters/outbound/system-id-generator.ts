import { randomUUID } from "node:crypto";

import type {
  IdGeneratorPort,
  IdKind,
} from "../../application/ports/id-generator-port.js";

export class SystemIdGenerator implements IdGeneratorPort {
  next(kind: IdKind): string {
    return `${kind}-${randomUUID()}`;
  }
}
