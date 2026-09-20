import type { AIProvider } from '../stores/useSettingsStore';

/** Attachments are never accepted here; only plain text can be selected. */
export function emailBodyForAI(
  bodyText: string | undefined,
  provider: AIProvider,
  allowCloudEmailBody: boolean,
): string | undefined {
  return provider === 'ollama' || allowCloudEmailBody ? bodyText : undefined;
}
