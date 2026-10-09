import type { AIProvider } from '../stores/useSettingsStore';
import { selectEmailBodyForAI } from '../../core/ai/privacy';

/** Attachments are never accepted here; only plain text can be selected. */
export function emailBodyForAI(
  bodyText: string | undefined,
  provider: AIProvider,
  allowCloudEmailBody: boolean,
  endpoint?: string,
): string | undefined {
  return selectEmailBodyForAI({ bodyText, provider, allowCloudEmailBody, endpoint });
}
