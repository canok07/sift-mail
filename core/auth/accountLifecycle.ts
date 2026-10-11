// Shared cancellation boundary for all account auth adapters, not a mail worker.
const generations = new Map<string, number>();
const key = (email: string) => email.trim().toLowerCase();
export const accountGeneration = (email: string) => generations.get(key(email)) || 0;
export const accountGenerationSnapshot = () => new Map(generations);
export function invalidateAccount(email: string): void {
  generations.set(key(email), accountGeneration(email) + 1);
}
