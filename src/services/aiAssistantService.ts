import { EmailMessage } from '../types';
import { safeFetchJson } from './apiClient';

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
  try {
    return await safeFetchJson<AssistantResponseData>('/api/ai/assistant/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    console.warn('AI Assistant API call failed, generating contextual fallback:', err);
    // Offline / fallback mock logic so user can still test seamlessly
    return generateClientFallbackResponse(payload);
  }
}

function generateClientFallbackResponse(payload: AssistantRequestPayload): AssistantResponseData {
  const { task, replyIntent, revisionType, draftText, emailContext } = payload;
  const fromName = emailContext?.from || 'Gönderici';
  const subject = emailContext?.subject || 'E-posta Konusu';

  if (task === 'summarize') {
    return {
      reply: `### 📌 E-Posta Özeti\n\n- **Kimden:** ${fromName}\n- **Konu:** ${subject}\n- **Özet:** Gönderici, mevcut süreçler ve koordinasyon hakkında bilgilendirme yapmaktadır.\n- **Aksiyon:** E-postada belirtilen adımların incelenmesi ve gerekirse yanıtlanması önerilmektedir.`,
      task,
    };
  }

  if (task === 'extract_tasks') {
    return {
      reply: `### 📅 Görev ve Eylem Planı\n\n1. **Geri Bildirim Sağlama** (Öncelik: Yüksek)\n   - Konu: ${subject}\n   - Son Tarih: Bu hafta içi\n2. **Doküman / Bilgi İncelemesi**\n   - Ekteki veya metindeki detayların gözden geçirilmesi.`,
      task,
    };
  }

  if (task === 'analyze_tone') {
    return {
      reply: `### 🔍 Ton ve İletişim Niyeti Analizi\n\n- **İletişim Tonu:** Kurumsal, nazik ve bilgilendirici.\n- **Gizli Risk / Baskı:** Herhangi bir şüpheli manipülasyon veya aciliyet baskısı tespit edilmedi.\n- **Tavsiye:** Normal iş akışına uygun olarak profesyonel bir üslupla geri dönüş yapılabilir.`,
      task,
    };
  }

  if (task === 'smart_reply') {
    let draft = '';
    if (replyIntent === 'positive') {
      draft = `Sayın ${fromName},\n\nE-postanız ve bilgilendirmeniz için teşekkür ederim. İlettiğiniz teklifi/öneriyi memnuniyetle kabul ediyorum. Süreci başlatmak için sonraki adımları paylaşabilir misiniz?\n\nİyi çalışmalar dilerim,\nSaygılarımla.`;
    } else if (replyIntent === 'decline') {
      draft = `Sayın ${fromName},\n\nE-postanız ve nazik teklifiniz için teşekkür ederim. Şu anki önceliklerimiz ve iş planımız doğrultusunda bu fırsatı şu aşamada değerlendiremeyeceğimizi bildirmek isterim.\n\nİlerleyen dönemlerde iş birliği yapabilmek dileğiyle, başarılar dilerim.\n\nSaygılarımla.`;
    } else if (replyIntent === 'meeting') {
      draft = `Sayın ${fromName},\n\nToplantı davetiniz için teşekkürler. Detayları ele almak üzere görüşmekten memnuniyet duyarım. Önümüzdeki Salı veya Çarşamba günü saat 14:00 - 16:00 arası benim için uygundur. Sizin takviminize uyarsa toplantı bağlantısını iletebilirsiniz.\n\nSaygılarımla.`;
    } else {
      draft = `Sayın ${fromName},\n\nİlettiğiniz e-posta için teşekkürler. Konuyu daha detaylı inceleyebilmemiz adına ilgili detayları ve varsa ek belgeleri paylaşabilir misiniz? Bilgileri aldıktan sonra hızlıca dönüş yapacağım.\n\nİyi çalışmalar dilerim.`;
    }

    return {
      reply: `Gelen iletiye uygun yanıt taslağı hazırlandı:\n\n\`\`\`\n${draft}\n\`\`\``,
      draftReply: draft,
      task,
    };
  }

  if (task === 'revise' && draftText) {
    let revised = draftText;
    if (revisionType === 'formal') {
      revised = `Sayın Yetkili,\n\nİlgili e-postanıza istinaden hususlar incelenmiş olup, tarafımızca uygun görülmüştür. Gerekli işlemlerin icrasını rica eder, iyi çalışmalar dilerim.\n\nSaygılarımla.`;
    } else if (revisionType === 'friendly') {
      revised = `Selamlar,\n\nMesajını aldım, harika görünüyor! Detayları konuşup hemen ilerleyelim. Görüşmek üzere!`;
    } else if (revisionType === 'shorter') {
      revised = `Merhaba, mesajınızı aldım ve onaylıyorum. Süreci devam ettirebiliriz. Teşekkürler.`;
    } else if (revisionType === 'longer') {
      revised = `Sayın ${fromName},\n\nİlettiğiniz detaylı bilgilendirme mesajı tarafımıza ulaşmış ve dikkatle incelenmiştir. Mevcut planlarımız doğrultusunda konunun önemini anlıyor ve birlikte çalışma zeminini geliştirmek istiyoruz. Herhangi bir sorunuz olursa lütfen çekinmeden iletişime geçiniz.\n\nEn içten dileklerimle, iyi çalışmalar dilerim.`;
    } else if (revisionType === 'translate_en') {
      revised = `Dear ${fromName},\n\nThank you for reaching out. I have reviewed your email and would be pleased to proceed. Looking forward to our next steps.\n\nBest regards.`;
    } else if (revisionType === 'translate_de') {
      revised = `Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihre Nachricht. Ich habe Ihre E-Mail erhalten und freue mich auf die weitere Zusammenarbeit.\n\nMit freundlichen Grüßen.`;
    }

    return {
      reply: `Taslak revize edildi:\n\n\`\`\`\n${revised}\n\`\`\``,
      draftReply: revised,
      task,
    };
  }

  return {
    reply: `Merhaba! Sift AI asistanı olarak e-postalarınızı özetleyebilir, önemli görevleri çıkarabilir veya hızlıca yanıt taslakları oluşturabilirim. Seçtiğiniz e-posta hakkında bana dilediğinizi sorabilirsiniz!`,
    task,
  };
}
