import { EmailMessage } from '../types';
import { safeFetchJson } from './apiClient';
import { useSettingsStore } from '../stores/useSettingsStore';
import { emailBodyForAI } from './aiPrivacy';
import { getAnalysisCacheVersion } from './emailAnalyzer';

export type AssistantTask =
  | 'general_chat'
  | 'summarize'
  | 'extract_tasks'
  | 'analyze_tone'
  | 'smart_reply'
  | 'revise';

export type ReplyIntent = 'positive' | 'decline' | 'meeting' | 'more_info';

export type RevisionType =
  | 'formal'
  | 'friendly'
  | 'shorter'
  | 'longer'
  | 'translate_en'
  | 'translate_de'
  | 'translate_tr';

export interface AssistantChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  draftReply?: string;
  taskType?: AssistantTask;
}

export interface AssistantRequestPayload {
  messages: { role: 'user' | 'model'; content: string }[];
  emailContext?: {
    id?: string;
    from?: string;
    fromEmail?: string;
    subject?: string;
    date?: string;
    snippet?: string;
    bodyText?: string;
    classification?: string;
    safetyScore?: number;
    category?: string;
  };
  task?: AssistantTask;
  replyIntent?: ReplyIntent;
  revisionType?: RevisionType;
  draftText?: string;
}

export interface AssistantResponseData {
  reply: string;
  draftReply?: string;
  task?: AssistantTask;
}

export async function askAIAssistant(
  payload: AssistantRequestPayload
): Promise<AssistantResponseData> {
  const settings = useSettingsStore.getState();
  if (!settings.aiEnabled) throw new Error('AI_UNAVAILABLE');
  const cacheVersion = getAnalysisCacheVersion();
  const emailContext = payload.emailContext
    ? { ...payload.emailContext, bodyText: emailBodyForAI(payload.emailContext.bodyText, settings.aiProvider, settings.allowCloudEmailBody, settings.ollamaEndpoint) }
    : undefined;
  const response = await safeFetchJson<AssistantResponseData>('/api/ai/assistant/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...payload, emailContext, provider: settings.aiProvider, allowCloudEmailBody: settings.allowCloudEmailBody, ollamaEndpoint: settings.ollamaEndpoint }),
    });
  if (getAnalysisCacheVersion() !== cacheVersion) throw new Error('AI_REQUEST_SUPERSEDED');
  return response;
}
