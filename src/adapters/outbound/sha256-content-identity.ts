import { createHash } from "node:crypto";

import type { ContentIdentityPort } from "../../application/ports/content-identity-port.js";

export class Sha256ContentIdentity implements ContentIdentityPort {
  digest(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }
}
