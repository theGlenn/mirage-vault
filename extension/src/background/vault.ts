import { applyMasking, detectEntities, replaceKnownTokens } from "../shared/tokenizer";
import type { EntityType } from "../shared/types";

type CounterMap = Record<EntityType, number>;

function createCounterMap(): CounterMap {
  return {
    EMAIL: 0,
    PHONE: 0,
    AMT: 0,
    ORG: 0,
    PERSON: 0
  };
}

export class SessionVault {
  private readonly reverseKeyToToken = new Map<string, string>();
  private readonly tokenToOriginal = new Map<string, string>();
  private readonly counters: CounterMap = createCounterMap();

  maskText(text: string): { maskedText: string; entitiesCount: number } {
    const entities = detectEntities(text);
    return applyMasking(text, entities, (entity) => this.getOrCreateToken(entity.type, entity.value));
  }

  rehydrateText(text: string): string {
    return replaceKnownTokens(text, (token) => this.tokenToOriginal.get(token) ?? null);
  }

  private getOrCreateToken(type: EntityType, original: string): string {
    const reverseKey = `${type}\u0000${original}`;
    const existing = this.reverseKeyToToken.get(reverseKey);
    if (existing) {
      return existing;
    }
    this.counters[type] += 1;
    const token = `[[${type}_${this.counters[type]}]]`;
    this.reverseKeyToToken.set(reverseKey, token);
    this.tokenToOriginal.set(token, original);
    return token;
  }
}
