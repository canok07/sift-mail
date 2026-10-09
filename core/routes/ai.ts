import { Router, type RequestHandler } from 'express';
import { analyzeWithMultiModel, generateAssistantText, resolveOllamaEndpoint } from '../ai/multiModelService';
import { buildAssistantPrompt } from '../ai/assistant';
import { canShareEmailBody, sanitizeEmailForAI } from '../ai/privacy';
import { requireApiToken, sensitiveApiLimiter } from '../security';
import { AiAnalyzeSchema, AnalyzeBatchSchema, AssistantChatSchema, validateBody } from '../security/validation';

export function createAiRouter(): Router {
  const router = Router();
  router.use(['/ai/analyze', '/analyze-email', '/analyze-batch', '/ai/assistant/chat'], sensitiveApiLimiter, requireApiToken, (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const analyze: RequestHandler = async (req, res) => {
    try { res.json(await analyzeWithMultiModel(req.body)); }
    catch { res.status(502).json({ success: false, error: 'AI_ANALYSIS_UNAVAILABLE' }); }
  };
  router.post('/ai/analyze', validateBody(AiAnalyzeSchema), analyze);
  // Compatibility URLs share the same service and fail-closed privacy defaults.
  router.post('/analyze-email', validateBody(AiAnalyzeSchema), analyze);
  router.post('/analyze-batch', validateBody(AnalyzeBatchSchema), async (req, res) => {
    try {
      const results = [];
      for (const email of req.body.emails) {
        results.push({ id: email.id, ...await analyzeWithMultiModel(AiAnalyzeSchema.parse({
          from: email.from, subject: email.subject, snippet: email.snippet,
          provider: req.body.provider, modelName: req.body.model,
          allowCloudEmailBody: false,
        })) });
      }
      res.json({ results });
    } catch { res.status(502).json({ success: false, error: 'AI_ANALYSIS_UNAVAILABLE' }); }
  });
  router.post('/ai/assistant/chat', validateBody(AssistantChatSchema), async (req, res) => {
    try {
      const provider = req.body.provider || 'gemini';
      // Resolve exactly the endpoint that will receive the request, including vault defaults.
      const endpoint = provider === 'ollama' ? resolveOllamaEndpoint(req.body.ollamaEndpoint) : undefined;
      const bodyAllowed = canShareEmailBody(provider, req.body.allowCloudEmailBody, endpoint);
      if (req.body.task === 'revise' && !bodyAllowed) {
        return res.status(403).json({ success: false, error: 'AI_BODY_SHARING_REQUIRED' });
      }
      const emailContext = req.body.emailContext
        ? sanitizeEmailForAI(req.body.emailContext, provider, req.body.allowCloudEmailBody, endpoint) : undefined;
      // Old assistant responses can contain email bodies. Without consent, submit only the
      // latest explicitly typed user message, never automatic conversation history.
      const messages = bodyAllowed ? req.body.messages : req.body.messages.filter((m: any) => m.role === 'user').slice(-1);
      const built = buildAssistantPrompt({ ...req.body, emailContext, messages });
      const reply = await generateAssistantText({ provider, prompt: built.prompt,
        systemInstruction: built.systemInstruction, modelName: req.body.model, ollamaEndpoint: endpoint });
      if (!reply.trim()) throw new Error('AI_EMPTY_RESPONSE');
      res.json({ reply, task: built.task, draftReply: ['smart_reply', 'revise'].includes(built.task)
        ? reply.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '').trim() : undefined });
    } catch { res.status(502).json({ success: false, error: 'AI_ASSISTANT_UNAVAILABLE' }); }
  });
  return router;
}
