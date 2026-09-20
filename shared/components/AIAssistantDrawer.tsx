import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import {
  Sparkles,
  X,
  Send,
  Trash2,
  Copy,
  Check,
  RotateCcw,
  CheckCircle2,
  Calendar,
  Smile,
  Briefcase,
  FileText,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  ArrowRight,
  Languages,
  Clock,
  ExternalLink,
  MailCheck,
  ChevronDown,
  Minimize2,
  Maximize2,
  Sliders,
} from 'lucide-react';
import { EmailMessage } from '../types';
import {
  askAIAssistant,
  AssistantChatMessage,
  AssistantTask,
  ReplyIntent,
  RevisionType,
} from '../services/aiAssistantService';
import { AppTheme } from './Header';

interface AIAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedEmail: EmailMessage | null;
  onSelectEmailForReply: (email: EmailMessage, initialDraft?: string) => void;
  theme?: AppTheme;
}

export const AIAssistantDrawer: React.FC<AIAssistantDrawerProps> = ({
  isOpen,
  onClose,
  selectedEmail,
  onSelectEmailForReply,
  theme = 'light',
}) => {
  const isOled = theme === 'oled';
  const isDark = theme !== 'light';

  const [messages, setMessages] = useState<AssistantChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      content:
        'Merhaba! Ben **Sift AI Asistanı**. Seçtiğiniz e-postayı özetleyebilir, kritik görev ve tarihleri çıkarabilir, tonunu analiz edebilir veya profesyonel yanıt taslakları üretebilirim. Size nasıl yardımcı olabilirim?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentDraft, setCurrentDraft] = useState<string>('');
  const [copiedDraft, setCopiedDraft] = useState(false);
  const [isDraftCollapsed, setIsDraftCollapsed] = useState(false);
  const [isWide, setIsWide] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // When a new email is selected, notify the chat
  useEffect(() => {
    if (selectedEmail) {
      setMessages((prev) => [
        ...prev,
        {
          id: `email-context-${Date.now()}`,
          role: 'model',
          content: `📌 **Aktif E-posta Seçildi:**\n- **Kimden:** ${selectedEmail.fromName || selectedEmail.from}\n- **Konu:** ${selectedEmail.subject}\n\nBu e-posta için aşağıdaki hızlı aksiyonları kullanabilir veya özel bir istek yazabilirsiniz.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  }, [selectedEmail?.id]);

  const handleSendQuery = async (customPrompt?: string, taskType: AssistantTask = 'general_chat') => {
    const query = customPrompt || inputQuery;
    if (!query.trim() || isLoading) return;

    const userMsgId = `user-${Date.now()}`;
    const newMessages: AssistantChatMessage[] = [
      ...messages,
      {
        id: userMsgId,
        role: 'user',
        content: query,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        taskType,
      },
    ];

    setMessages(newMessages);
    if (!customPrompt) setInputQuery('');
    setIsLoading(true);

    try {
      const response = await askAIAssistant({
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        emailContext: selectedEmail
          ? {
              id: selectedEmail.id,
              from: selectedEmail.fromName || selectedEmail.from,
              fromEmail: selectedEmail.fromEmail,
              subject: selectedEmail.subject,
              date: selectedEmail.date,
              snippet: selectedEmail.snippet,
              bodyText: selectedEmail.bodyText,
              classification: selectedEmail.analysis?.classification,
              safetyScore: selectedEmail.analysis?.safetyScore,
            }
          : undefined,
        task: taskType,
      });

      const assistantMsg: AssistantChatMessage = {
        id: `model-${Date.now()}`,
        role: 'model',
        content: response.reply,
        draftReply: response.draftReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        taskType,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      if (response.draftReply) {
        setCurrentDraft(response.draftReply);
        setIsDraftCollapsed(false);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'model',
          content: `⚠️ Bir hata oluştu: ${err.message || 'Yanıt alınamadı.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // 1-Click Smart Reply Generator
  const handleGenerateSmartReply = async (intent: ReplyIntent) => {
    if (!selectedEmail) {
      setMessages((prev) => [
        ...prev,
        {
          id: `warn-${Date.now()}`,
          role: 'model',
          content: '⚠️ Hızlı yanıt taslağı oluşturmak için lütfen önce listeden bir e-posta seçin.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      return;
    }

    const intentLabels: Record<ReplyIntent, string> = {
      positive: 'Olumlu Yanıt Hazırla',
      decline: 'Kibarca Reddetme Yanıtı Hazırla',
      meeting: 'Toplantı Randevusu Yanıtı Hazırla',
      more_info: 'Daha Fazla Bilgi İsteme Yanıtı Hazırla',
    };

    const userLabel = intentLabels[intent];

    const newMessages: AssistantChatMessage[] = [
      ...messages,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: `⚡ **${userLabel}** (E-posta: "${selectedEmail.subject}")`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        taskType: 'smart_reply',
      },
    ];

    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await askAIAssistant({
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        emailContext: {
          id: selectedEmail.id,
          from: selectedEmail.fromName || selectedEmail.from,
          fromEmail: selectedEmail.fromEmail,
          subject: selectedEmail.subject,
          date: selectedEmail.date,
          snippet: selectedEmail.snippet,
          bodyText: selectedEmail.bodyText,
        },
        task: 'smart_reply',
        replyIntent: intent,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `model-${Date.now()}`,
          role: 'model',
          content: response.reply,
          draftReply: response.draftReply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          taskType: 'smart_reply',
        },
      ]);

      if (response.draftReply) {
        setCurrentDraft(response.draftReply);
        setIsDraftCollapsed(false);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Revision / Tone / Translation modification
  const handleReviseDraft = async (type: RevisionType) => {
    if (!currentDraft.trim()) return;

    const revisionLabels: Record<RevisionType, string> = {
      formal: 'Daha Resmi Yap',
      friendly: 'Daha Samimi Yap',
      shorter: 'Kısalt ve Sadeleştir',
      longer: 'Genişlet ve Detaylandır',
      translate_en: "İngilizce'ye Çevir",
      translate_de: "Almanca'ya Çevir",
      translate_tr: "Türkçe'ye Çevir",
    };

    const label = revisionLabels[type];

    const newMessages: AssistantChatMessage[] = [
      ...messages,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: `🔄 **Revizyon İsteği:** ${label}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        taskType: 'revise',
      },
    ];

    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await askAIAssistant({
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        emailContext: selectedEmail
          ? {
              from: selectedEmail.fromName || selectedEmail.from,
              subject: selectedEmail.subject,
            }
          : undefined,
        task: 'revise',
        revisionType: type,
        draftText: currentDraft,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `model-${Date.now()}`,
          role: 'model',
          content: response.reply,
          draftReply: response.draftReply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          taskType: 'revise',
        },
      ]);

      if (response.draftReply) {
        setCurrentDraft(response.draftReply);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyDraft = () => {
    if (!currentDraft) return;
    navigator.clipboard.writeText(currentDraft);
    setCopiedDraft(true);
    setTimeout(() => setCopiedDraft(false), 2000);
  };

  const handleUseAsReply = () => {
    if (!selectedEmail) return;
    onSelectEmailForReply(selectedEmail, currentDraft);
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome-reset',
        role: 'model',
        content: 'Sohbet geçmişi temizlendi. Yeni bir soru sorabilir veya e-postanızı analiz ettirebilirsiniz.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setCurrentDraft('');
  };

  if (!isOpen) return null;

  const panelBg = isOled
    ? 'bg-[#0f0f11] text-zinc-100 border-l border-zinc-800'
    : isDark
    ? 'bg-[#18181b] text-zinc-100 border-l border-zinc-700'
    : 'bg-white text-zinc-900 border-l border-zinc-200 shadow-2xl';

  const cardBg = isDark ? 'bg-zinc-800/60 border-zinc-700' : 'bg-zinc-50 border-zinc-200';

  return (
    <motion.aside
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 26, stiffness: 280 }}
      className={`fixed top-0 right-0 bottom-0 z-40 flex flex-col transition-all duration-200 ${
        isWide ? 'w-full md:w-[600px]' : 'w-full md:w-[420px]'
      } ${panelBg}`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-xl bg-linear-to-tr from-emerald-500 to-teal-400 text-white shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-bold tracking-tight">Sift AI Asistanı</h2>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-500">
                Gemini 3.8
              </span>
            </div>
            <p className="text-[10px] opacity-60">Akıllı E-posta Analisti & Taslak Motoru</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsWide(!isWide)}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-zinc-400 hover:text-zinc-200 hidden md:inline-flex"
            title={isWide ? 'Daralt' : 'Genişlet'}
          >
            {isWide ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleClearChat}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-zinc-400 hover:text-zinc-200"
            title="Sohbeti Temizle"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-zinc-400 hover:text-zinc-200"
            title="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Selected Email Context Strip */}
      <div className="px-4 py-2.5 bg-black/5 dark:bg-white/5 border-b border-black/5 dark:border-white/5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <MailCheck className="w-3 h-3" />
            Aktif E-posta Bağlamı
          </span>
          {selectedEmail ? (
            <span className="text-[10px] opacity-60 truncate max-w-[200px] font-mono">
              {selectedEmail.fromName || selectedEmail.from}
            </span>
          ) : (
            <span className="text-[10px] text-zinc-400 italic">Listeden e-posta seçilmedi</span>
          )}
        </div>

        {selectedEmail ? (
          <div className="mt-1">
            <h4 className="text-xs font-semibold truncate text-zinc-900 dark:text-zinc-100">
              {selectedEmail.subject}
            </h4>
            <p className="text-[11px] opacity-65 truncate">{selectedEmail.snippet}</p>

            {/* Quick Email Action Chips */}
            <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-0.5 scrollbar-none">
              <button
                onClick={() => handleSendQuery('Bu e-postayı ana hatlarıyla özetle.', 'summarize')}
                disabled={isLoading}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors shrink-0"
              >
                <FileText className="w-2.5 h-2.5" />
                <span>Özetle</span>
              </button>

              <button
                onClick={() =>
                  handleSendQuery('Bu e-postadan görev ve tarihleri çıkar.', 'extract_tasks')
                }
                disabled={isLoading}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400 hover:bg-blue-500/25 transition-colors shrink-0"
              >
                <Calendar className="w-2.5 h-2.5" />
                <span>Görev & Tarih</span>
              </button>

              <button
                onClick={() =>
                  handleSendQuery('Bu e-postanın tonunu ve iletişim niyetini analiz et.', 'analyze_tone')
                }
                disabled={isLoading}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-400 hover:bg-purple-500/25 transition-colors shrink-0"
              >
                <Smile className="w-2.5 h-2.5" />
                <span>Ton Analizi</span>
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-zinc-500 mt-1">
            Listeden herhangi bir e-postaya tıkladığınızda asistan doğrudan o maili analiz etmeye hazır olur.
          </p>
        )}
      </div>

      {/* Akıllı Yanıt Üretme Menüsü (Preset Smart Replies) */}
      {selectedEmail && (
        <div className="px-4 py-2 border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] shrink-0">
          <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
            <span>⚡ Hızlı Yanıt Üret</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <button
              onClick={() => handleGenerateSmartReply('positive')}
              disabled={isLoading}
              className="px-2 py-1 rounded-lg border text-[10px] font-semibold hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-colors flex items-center justify-center gap-1 shrink-0"
            >
              <ThumbsUp className="w-2.5 h-2.5 text-emerald-500" />
              <span>Olumlu</span>
            </button>

            <button
              onClick={() => handleGenerateSmartReply('decline')}
              disabled={isLoading}
              className="px-2 py-1 rounded-lg border text-[10px] font-semibold hover:bg-rose-500/10 hover:border-rose-500/30 transition-colors flex items-center justify-center gap-1 shrink-0"
            >
              <ThumbsDown className="w-2.5 h-2.5 text-rose-500" />
              <span>Reddet</span>
            </button>

            <button
              onClick={() => handleGenerateSmartReply('meeting')}
              disabled={isLoading}
              className="px-2 py-1 rounded-lg border text-[10px] font-semibold hover:bg-blue-500/10 hover:border-blue-500/30 transition-colors flex items-center justify-center gap-1 shrink-0"
            >
              <Clock className="w-2.5 h-2.5 text-blue-500" />
              <span>Toplantı</span>
            </button>

            <button
              onClick={() => handleGenerateSmartReply('more_info')}
              disabled={isLoading}
              className="px-2 py-1 rounded-lg border text-[10px] font-semibold hover:bg-amber-500/10 hover:border-amber-500/30 transition-colors flex items-center justify-center gap-1 shrink-0"
            >
              <HelpCircle className="w-2.5 h-2.5 text-amber-500" />
              <span>Bilgi İste</span>
            </button>
          </div>
        </div>
      )}

      {/* Aktif Taslak & Revizyon Kutusu (Eğer taslak üretildiyse) */}
      {currentDraft && (
        <div className="px-4 py-2.5 border-b border-emerald-500/20 bg-emerald-500/[0.04] shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Hazır Taslak Yanıt</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCopyDraft}
                className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 text-zinc-500 hover:text-zinc-200 text-[10px] font-semibold flex items-center gap-1"
                title="Panoya Kopyala"
              >
                {copiedDraft ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>{copiedDraft ? 'Kopyalandı' : 'Kopyala'}</span>
              </button>

              <button
                onClick={() => setIsDraftCollapsed(!isDraftCollapsed)}
                className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 text-zinc-400"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    isDraftCollapsed ? '-rotate-90' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {!isDraftCollapsed && (
            <div className="space-y-2">
              <textarea
                value={currentDraft}
                onChange={(e) => setCurrentDraft(e.target.value)}
                rows={4}
                className={`w-full p-2.5 rounded-xl border text-[11px] leading-relaxed font-sans resize-none outline-none focus:ring-1 focus:ring-emerald-500 ${cardBg}`}
                placeholder="Taslak yanıt..."
              />

              {/* Revision Chips */}
              <div className="space-y-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                  Taslağı Revize Et:
                </span>
                <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                  <button
                    onClick={() => handleReviseDraft('formal')}
                    disabled={isLoading}
                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold border hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
                  >
                    Resmi
                  </button>
                  <button
                    onClick={() => handleReviseDraft('friendly')}
                    disabled={isLoading}
                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold border hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
                  >
                    Samimi
                  </button>
                  <button
                    onClick={() => handleReviseDraft('shorter')}
                    disabled={isLoading}
                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold border hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
                  >
                    Kısalt
                  </button>
                  <button
                    onClick={() => handleReviseDraft('longer')}
                    disabled={isLoading}
                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold border hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
                  >
                    Genişlet
                  </button>
                  <button
                    onClick={() => handleReviseDraft('translate_en')}
                    disabled={isLoading}
                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold border hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0 flex items-center gap-0.5"
                  >
                    <Languages className="w-2.5 h-2.5" />
                    <span>English</span>
                  </button>
                  <button
                    onClick={() => handleReviseDraft('translate_de')}
                    disabled={isLoading}
                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold border hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0 flex items-center gap-0.5"
                  >
                    <Languages className="w-2.5 h-2.5" />
                    <span>Deutsch</span>
                  </button>
                </div>
              </div>

              {/* Use as Reply Button */}
              {selectedEmail && (
                <button
                  onClick={handleUseAsReply}
                  className="w-full mt-1 py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Yanıt Olarak Kullan (Gönderim Formunu Aç)</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Chat Messages Timeline */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
            >
              <div
                className={`max-w-[88%] rounded-2xl p-3 text-xs leading-relaxed ${
                  isUser
                    ? 'bg-emerald-600 text-white rounded-br-xs font-medium'
                    : `${cardBg} rounded-bl-xs text-zinc-800 dark:text-zinc-200 shadow-xs border`
                }`}
              >
                <div className="prose prose-xs dark:prose-invert max-w-none">
                  <Markdown>{msg.content}</Markdown>
                </div>

                {/* If the message contains a generated draft, show quick shortcut */}
                {msg.draftReply && (
                  <div className="mt-2.5 pt-2 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Taslak Oluşturuldu
                    </span>
                    <button
                      onClick={() => {
                        setCurrentDraft(msg.draftReply || '');
                        setIsDraftCollapsed(false);
                      }}
                      className="text-[10px] font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline"
                    >
                      Taslak Kutusuna Al
                    </button>
                  </div>
                )}
              </div>

              <span className="text-[9px] text-zinc-400 px-1 font-mono">{msg.timestamp}</span>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-center gap-2 p-3 rounded-2xl bg-black/5 dark:bg-white/5 text-xs text-zinc-500 w-fit">
            <Sparkles className="w-3.5 h-3.5 text-emerald-500 animate-spin" />
            <span>Gemini düşünüyor ve e-postayı inceliyor...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-3 border-t border-black/10 dark:border-white/10 shrink-0 bg-black/[0.02] dark:bg-white/[0.02]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendQuery();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            disabled={isLoading}
            placeholder={
              selectedEmail
                ? `"${selectedEmail.subject.slice(0, 20)}..." hakkında sor...`
                : 'Yapay zeka asistanına e-posta hakkında soru sor...'
            }
            className={`flex-1 px-3 py-2 rounded-xl text-xs border outline-none focus:ring-1 focus:ring-emerald-500 transition-all ${
              isDark ? 'bg-zinc-800/80 text-zinc-100 border-zinc-700' : 'bg-white text-zinc-900 border-zinc-200'
            }`}
          />

          <button
            type="submit"
            disabled={isLoading || !inputQuery.trim()}
            className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 shadow-xs transition-colors shrink-0"
            title="Gönder"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </motion.aside>
  );
};
