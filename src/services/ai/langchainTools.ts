import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { EmailMessage } from '../../types';

export interface ProposedAIAction {
  id: string;
  emailId: string;
  emailSubject: string;
  sender: string;
  actionType: 'draft_reply' | 'trash_email' | 'label_email' | 'archive_email' | 'unsubscribe_sender';
  title: string;
  description: string;
  reasoning: string;
  payload: {
    replySubject?: string;
    replyBody?: string;
    labelName?: string;
    targetCategory?: string;
  };
  createdAt: string;
}

// 1. Tool: Draft Reply Tool
export const createDraftReplyTool = (onPropose: (action: ProposedAIAction) => void) =>
  new DynamicStructuredTool({
    name: 'draft_reply',
    description: 'Creates a polite, professional draft reply for the user to review and send.',
    schema: z.object({
      emailId: z.string(),
      sender: z.string(),
      emailSubject: z.string(),
      replySubject: z.string(),
      replyBody: z.string().describe('The formulated response in Turkish'),
      reasoning: z.string().describe('Why this response is appropriate'),
    }),
    func: async ({ emailId, sender, emailSubject, replySubject, replyBody, reasoning }) => {
      onPropose({
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        emailId,
        emailSubject,
        sender,
        actionType: 'draft_reply',
        title: 'Taslak Yanıt Oluştur',
        description: `"${sender}" için profesyonel bir yanıt taslağı hazırlandı.`,
        reasoning,
        payload: {
          replySubject,
          replyBody,
        },
        createdAt: new Date().toISOString(),
      });
      return 'Human-in-the-Loop: Yanıt taslağı kullanıcı onayına sunuldu.';
    },
  });

// 2. Tool: Trash Email Tool
export const createTrashEmailTool = (onPropose: (action: ProposedAIAction) => void) =>
  new DynamicStructuredTool({
    name: 'trash_email',
    description: 'Proposes moving a spam, phishing or unwanted message to trash with user confirmation.',
    schema: z.object({
      emailId: z.string(),
      emailSubject: z.string(),
      sender: z.string(),
      reasoning: z.string().describe('Why this email should be moved to trash'),
    }),
    func: async ({ emailId, emailSubject, sender, reasoning }) => {
      onPropose({
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        emailId,
        emailSubject,
        sender,
        actionType: 'trash_email',
        title: 'İletiyi Çöpe Taşı',
        description: `"${emailSubject}" başlıklı iletiyi Çöp Kutusuna taşımak istiyor.`,
        reasoning,
        payload: {},
        createdAt: new Date().toISOString(),
      });
      return 'Human-in-the-Loop: Silme işlemi kullanıcı onayına sunuldu.';
    },
  });

// 3. Tool: Label / Category Email Tool
export const createLabelEmailTool = (onPropose: (action: ProposedAIAction) => void) =>
  new DynamicStructuredTool({
    name: 'label_email',
    description: 'Proposes categorizing or assigning a label to an email.',
    schema: z.object({
      emailId: z.string(),
      emailSubject: z.string(),
      sender: z.string(),
      labelName: z.string().describe('Category or label name e.g. İş, Finans, Alışveriş'),
      reasoning: z.string(),
    }),
    func: async ({ emailId, emailSubject, sender, labelName, reasoning }) => {
      onPropose({
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        emailId,
        emailSubject,
        sender,
        actionType: 'label_email',
        title: `Etiket Uygula: ${labelName}`,
        description: `İletiyi "${labelName}" akıllı kategorisine dahil etmek istiyor.`,
        reasoning,
        payload: { labelName },
        createdAt: new Date().toISOString(),
      });
      return 'Human-in-the-Loop: Etiketleme işlemi kullanıcı onayına sunuldu.';
    },
  });

// Helper to formulate a human-in-the-loop action proposal based on an email
export async function generateSmartAIAction(
  email: EmailMessage,
  actionHint: 'reply' | 'trash' | 'archive' = 'reply'
): Promise<ProposedAIAction> {
  const senderDisplayName = email.fromName || email.fromEmail || email.from;

  if (actionHint === 'reply') {
    // Generate an intelligent draft reply proposal
    let suggestedBody = '';
    if (email.analysis?.safeCategory === 'work') {
      suggestedBody = `Merhaba,\n\n"${email.subject}" konulu iletinizi aldım ve inceledim. Konuyla ilgili detayları hazırlayıp gün içerisinde size dönüş yapacağım.\n\nİyi çalışmalar dilerim,\nSaygılarımla.`;
    } else if (email.analysis?.safeCategory === 'finance') {
      suggestedBody = `Merhaba,\n\nİletmiş olduğunuz fatura ve ödeme bilgilerini teslim aldım. Muhasebe ve ödeme kayıtlarımız kontrol edilerek onaylanacaktır.\n\nTeşekkürler.`;
    } else {
      suggestedBody = `Merhaba ${senderDisplayName},\n\nE-postanız tarafıma ulaştı. En kısa sürede inceleyip sizinle iletişime geçeceğim.\n\nİyi günler.`;
    }

    return {
      id: `act-${Date.now()}`,
      emailId: email.id,
      emailSubject: email.subject,
      sender: senderDisplayName,
      actionType: 'draft_reply',
      title: 'Yapay Zeka Yanıt Taslağı Hazırladı',
      description: `"${senderDisplayName}" için profesyonel bir e-posta yanıt taslağı oluşturuldu.`,
      reasoning: email.analysis?.reasoning || 'İletinin içeriği analiz edilerek nazik ve resmi bir yanıt kurgulandı.',
      payload: {
        replySubject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
        replyBody: suggestedBody,
      },
      createdAt: new Date().toISOString(),
    };
  }

  if (actionHint === 'trash') {
    return {
      id: `act-${Date.now()}`,
      emailId: email.id,
      emailSubject: email.subject,
      sender: senderDisplayName,
      actionType: 'trash_email',
      title: 'İletiyi Çöp Kutusuna Taşı',
      description: `"${email.subject}" başlıklı iletinin spam veya gereksiz olduğu değerlendirildi.`,
      reasoning: email.analysis?.reasoning || 'Güvenlik skoru düşük ve doğrudan eylem gerektirmeyen tanıtım/spam içeriği.',
      payload: {},
      createdAt: new Date().toISOString(),
    };
  }

  return {
    id: `act-${Date.now()}`,
    emailId: email.id,
    emailSubject: email.subject,
    sender: senderDisplayName,
    actionType: 'archive_email',
    title: 'İletiyi Güvenli Olarak Arşivle',
    description: `"${email.subject}" başlıklı güvenli ileti arşive taşınsın mı?`,
    reasoning: 'Gerekli bilgiler alındı, gelen kutusunu sadeleştirmek için arşivlenmesi öneriliyor.',
    payload: {},
    createdAt: new Date().toISOString(),
  };
}
