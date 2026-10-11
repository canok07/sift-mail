// Compatibility entry point for existing local-cache clients and account cleanup.
export { loadLocalMailSnapshot, saveLocalMailSnapshot } from '../storage/mailRepository';
export type { LocalMailSnapshot } from '../storage/mailRepository';
