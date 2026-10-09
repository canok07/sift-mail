export type SupportedAIProvider = 'gemini' | 'openai' | 'anthropic' | 'ollama';

/** A provider name is not proof that a request stays on this device. */
export function isLoopbackAiEndpoint(endpoint = 'http://localhost:11434'): boolean {
  try {
    const url = new URL(endpoint);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
  } catch { return false; }
}

export function canShareEmailBody(provider: SupportedAIProvider, allowCloudEmailBody?: boolean, endpoint?: string): boolean {
  return allowCloudEmailBody === true || (provider === 'ollama' && isLoopbackAiEndpoint(endpoint));
}

export function selectEmailBodyForAI(params: {
  bodyText?: string; provider: SupportedAIProvider; endpoint?: string; allowCloudEmailBody?: boolean;
}): string | undefined {
  return canShareEmailBody(params.provider, params.allowCloudEmailBody, params.endpoint)
    ? params.bodyText?.slice(0, 12000) : undefined;
}

/** With body sharing disabled, retain only the documented short preview. */
export function sanitizeEmailForAI<T extends { snippet?: string; bodyText?: string; body?: string; headers?: string }>(
  email: T, provider: SupportedAIProvider, allowCloudEmailBody?: boolean, endpoint?: string,
): T {
  const full = canShareEmailBody(provider, allowCloudEmailBody, endpoint);
  return { ...email, snippet: email.snippet?.slice(0, 240), body: undefined,
    bodyText: selectEmailBodyForAI({ bodyText: email.bodyText || email.body, provider, allowCloudEmailBody, endpoint }),
    headers: full ? email.headers?.slice(0, 4000) : undefined };
}
