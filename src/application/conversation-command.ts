import { ConversationCommandSchema, ConversationCommandSuccessSchema, type ConversationCommandSuccess } from "../domain/conversation-command-contracts.js";
import { StateBoundaryError } from "../domain/state-contracts.js";
import type { ConversationService } from "./conversation-service.js";

export type ConversationCommandHandler = (input: unknown, signal?: AbortSignal) => Promise<ConversationCommandSuccess>;

export function createConversationCommandHandler(service: ConversationService): ConversationCommandHandler {
  return async (raw, signal) => {
    const parsed = ConversationCommandSchema.safeParse(raw);
    if (!parsed.success) throw new StateBoundaryError("STATE_INPUT_INVALID");
    const { operation, ...request } = parsed.data;
    let value: unknown;
    switch (operation) {
      case "create": value = await service.create(request, signal); break;
      case "read": value = await service.read((request as { conversationId: string }).conversationId, signal); break;
      case "run_turn": value = await service.runTurn(request, signal); break;
      case "write_memory": value = await service.writeMemory(request, signal); break;
      case "delete_memory": value = await service.deleteMemory(request, signal); break;
      case "recover": value = await service.recover(request, signal); break;
      case "purge": value = await service.purge(signal); break;
      case "audit": value = await service.audit((request as { conversationId: string }).conversationId, signal); break;
    }
    const result = ConversationCommandSuccessSchema.safeParse({ ok: true, operation, value });
    if (!result.success) throw new StateBoundaryError("STATE_INVALID");
    return result.data;
  };
}
