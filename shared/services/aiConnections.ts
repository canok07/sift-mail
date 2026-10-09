import { safeFetchJson } from './apiClient';
import { useSettingsStore } from '../stores/useSettingsStore';

export type PluginStatus = 'NOT_CONFIGURED' | 'CONFIGURED' | 'CONNECTED' | 'DISABLED' | 'ERROR';
export interface ConnectionPlugin {
  id: string; name: string; kind: string; capabilities: string[];
  enabled: boolean; status: PluginStatus; message?: string;
  configuration?: { model: string; endpoint?: string };
}
export const AI_CONNECTION_CHANGED = 'sift-ai-connection-changed';
let latestRequest = 0;
export async function refreshAIConnections(): Promise<ConnectionPlugin[]> {
  const request = ++latestRequest;
  const data = await safeFetchJson<{ plugins: ConnectionPlugin[] }>('/api/plugins');
  if (request !== latestRequest) return data.plugins;
  const settings = useSettingsStore.getState();
  const selected = data.plugins.find(plugin => plugin.id === settings.aiProvider);
  const ready = selected?.enabled === true && selected.status === 'CONNECTED';
  if (settings.aiEnabled !== ready) settings.setAIEnabled(ready);
  if (ready && selected.id === 'ollama' && selected.configuration?.endpoint) settings.setOllamaEndpoint(selected.configuration.endpoint);
  return data.plugins;
}
export function notifyAIConnectionChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AI_CONNECTION_CHANGED));
}
