# Sift — AI-Powered Inbox / Yapay Zeka Destekli E-Posta İstemcisi

> **Minimalist, privacy-first, and AI-powered desktop & web email client designed for achieving Inbox Zero with zero-crash stability and military-grade tracker protection.**  
> *Sıfır çökme garantili kararlı mimari, çoklu hesap birleştirme ve dinamik çoklu yapay zeka modelleriyle güçlendirilmiş minimalist yeni nesil e-posta deneyimi.*

[![License: MIT](https://img.shields.io/badge/License-MIT-zinc.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.0-61dafb.svg)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38bdf8.svg)](https://tailwindcss.com/)
[![PWA](https://img.shields.io/badge/PWA-Ready-orange.svg)](https://web.dev/progressive-web-apps/)
[![Node.js](https://img.shields.io/badge/Node.js-server.cjs-green.svg)](https://nodejs.org/)
[![Zod](https://img.shields.io/badge/Schema-Zod-3068b7.svg)](https://zod.dev/)

---

*English documentation is presented first, followed by the complete Turkish documentation below.*  
*Türkçe dokümantasyon için [aşağı kaydırın](#tr-sift--yapay-zeka-destekli-gelen-kutusu) veya sayfanın altındaki bölüme göz atın.*

---

## English Documentation

### 1. Executive Summary & Architectural Vision

Modern email clients have evolved into sluggish, data-harvesting dashboards crammed with tracking beacons, intrusive ads, and cognitive overload. **Sift** was engineered from first principles around the **Zenbox philosophy** — stripping away visual noise while arming users with state-of-the-art AI triage, multi-account orchestration, and zero-crash fault-tolerant architecture.

- **Unified Inbox Zero**: Aggregates disparate inboxes into an intelligent, unified single pane of glass ("All Inboxes") with instant cross-account categorization.
- **Privacy & Anti-Tracking Shield**: Client-side neutralizing of `1x1` spy pixels, link tracking sanitization, and strict air-gapped credential storage.
- **Zero-Crash Resilience**: Built with layered React Error Boundaries and defensive optional-chaining (`?.` and `|| []`) paradigms across every state tree.

---

### 2. Core Technology Stack

| Layer | Technologies & Purpose |
| :--- | :--- |
| **Frontend Core** | **React 19**, **TypeScript 5.8**, **Vite 6** — ultra-fast HMR and type-sound component trees |
| **Progressive Web App (PWA)** | **vite-plugin-pwa**, Service Workers, offline manifest & installable standalone experience |
| **Styling & Layout** | **Tailwind CSS v4**, **Motion (Framer Motion)** — ergonomic 44px+ touch targets and OLED True Black mode |
| **Backend & Bundling** | **Node.js**, **Express**, compiled into a standalone production **`dist/server.cjs`** via **esbuild** |
| **Schema & Validation** | **Zod** schema validations for AI payloads, IMAP configurations, and API inputs |
| **Protocols & Mail Engine**| **ImapFlow** (asynchronous modern IMAP), **Nodemailer** (SMTP relay) |
| **State & Localization** | **Zustand** (lightweight reactive state), **i18next** (English, Turkish, German) |

---

### 3. Key Architectural Features

#### 📬 Multi-IMAP Account Management & "All Inboxes" View
- **Universal Provider Support**: Seamlessly connect Gmail, Outlook, Yahoo, iCloud, Fastmail, or custom corporate IMAP/SMTP servers.
- **Unified "All Inboxes" Stream**: Read, filter, and triage incoming emails from all connected mail accounts simultaneously in one synchronized view.
- **Isolated Account Profiles**: Each account maintains independent credentials, security tokens, and sync states. Accounts can be inspected or cleanly removed with single-click safety dialogs.
- **Modern Vertical Sidebar**: Sleek, high-contrast vertical navigation providing quick access to categorized views (Inbox, Starred, VIP, Newsletters, Security, Spam), storage quotas, account indicators, and modal settings.

#### 🧠 Multi-Provider AI Integration (Dynamic Model Selector)
Sift offers a plug-and-play multi-model selector allowing users to switch models dynamically according to speed, privacy, and reasoning requirements:
- **Google Gemini (gemini-2.5-flash / gemini-3.8-flash)**: Ultra-fast contextual parsing, tone detection, and smart Turkish/English summarization.
- **OpenAI (GPT-4o)**: Complex reasoning, deep email intent extraction, and automated action suggestions.
- **Anthropic Claude (Claude 3.5 / Claude 3.7 Sonnet)**: Precise security auditing, phishing risk assessment, and hybrid reasoning for complex drafts.
- **Ollama (100% Local / Air-Gapped)**: Run models like `llama3`, `mistral`, or `qwen` on `localhost:11434` for zero-cost, fully offline privacy.
- **Automated Tasks**: One-click AI response drafting, tone adjustment (Formal, Concise, Friendly), phishing/spam anomaly scores, and automatic category routing.

#### 🛡️ Stability & Zero-Crash Assurance
- **Comprehensive Error Boundaries**: Global and module-level React Error Boundaries capture unexpected rendering exceptions, preventing blank-screen crashes and presenting recovery actions.
- **Defensive Data Navigation**: All dynamic asynchronous payloads employ strict defensive access patterns (`?.` and `|| []`), preventing `TypeError: Cannot read properties of undefined` runtime crashes.
- **Zod Schema Enforcement**: Structured parsing guarantees that LLM JSON responses conform to strict typed interfaces before passing to UI renderers.

---

### 4. Installation & Getting Started

#### Prerequisites
- **Node.js**: v20.x or higher
- **npm**: v10.x or higher (or `pnpm` / `yarn`)
- *(Optional)* [Ollama](https://ollama.com/) running locally for air-gapped offline AI.

#### Setup Steps

```bash
# 1. Clone repository
git clone https://github.com/your-username/sift.git
cd sift

# 2. Install dependencies
npm install

# 3. Configure environment keys
cp .env.example .env

# 4. Launch full-stack development server
npm run dev
```
The application will be accessible at `http://localhost:3000`.

---

### 5. Production Build & Deployment

To compile the Vite client application and package the Node.js backend into a standalone `dist/server.cjs` bundle:

```bash
# Build optimized frontend & bundle backend into dist/server.cjs
npm run build

# Start production server
npm run start
```

---

<br />

---

<a name="tr-sift--yapay-zeka-destekli-gelen-kutusu"></a>

## Türkçe Dokümantasyon

### 1. Proje Özeti ve Mimari Vizyon

Geleneksel e-posta istemcileri; gizli izleme pikselleri, dikkat dağıtıcı bültenler ve karmaşık arayüzlerle modern kullanıcının vaktini çalan birer bilgi çöplüğüne dönüşmüştür. **Sift**, **Zenbox felsefesi** odağında sıfırdan geliştirilmiştir; amacı görsel karmaşayı yok etmek, gelen kutusunu **Inbox Zero** hedefine ulaştırmak ve kullanıcıya tam veri gizliliği ile sıfır çökme garantili bir deneyim sunmaktır.

- **Birleşik "Tüm Kutular" Deneyimi**: Farklı sağlayıcılardaki (Gmail, Outlook, kurumsal IMAP) tüm e-postaları tek ekranda toplar.
- **İzleme Piksellerine Karşı Kalkan**: E-postalara gizlenen `1x1` boyutundaki casus pikselleri ve web işaretçilerini istemci tarafında anında etkisiz hale getirir.
- **Sıfır Çökme Garantili Arayüz**: Hata yakalama sınırları (Error Boundaries) ve güvenli veri zincirleme (`?.` ve `|| []`) prensipleriyle hiçbir beklenmedik veri durumunda ekran donmaz veya çökmez.

---

### 2. Teknoloji Yığını

| Katman | Kullanılan Teknolojiler & Rolü |
| :--- | :--- |
| **Ön Yüz (Frontend)** | **React 19**, **TypeScript 5.8**, **Vite 6** — Yüksek performanslı reaktif bileşen mimarisi |
| **PWA Desteği** | **vite-plugin-pwa**, Service Worker altyapısı, çevrimdışı önbellekleme ve masaüstü/mobil kurulabilirlik |
| **Stil & Tasarım** | **Tailwind CSS v4**, **Motion (Framer Motion)** — Modern koyu modlar (OLED Siyah), 44px+ ergonomik dokunma alanları |
| **Arka Yüz (Backend)** | **Node.js**, **Express**, esbuild ile derlenmiş tek parça **`dist/server.cjs`** paketi |
| **Veri & Şema Doğrulama**| **Zod** ile yapay zeka çıktıları, IMAP hesap yapıları ve API isteklerinin tip güvenliği |
| **Protokoller** | **ImapFlow** (asenkron modern IMAP istemcisi), **Nodemailer** (SMTP e-posta iletimi) |
| **Durum & Çoklu Dil** | **Zustand** (hafif merkezi durum yönetimi), **i18next** (Türkçe, İngilizce, Almanca) |

---

### 3. Temel Özellikler ve Mimari Detaylar

#### 📬 Çoklu IMAP Hesap Yönetimi ve "Tüm Kutular" Görünümü
- **Evrensel Sağlayıcı Desteği**: Gmail, Microsoft Outlook / Office 365, Yahoo, iCloud, Fastmail ve şirket içi özel IMAP/SMTP sunucuları ile tam uyum.
- **"Tüm Kutular" Birleşik Görünümü**: Birden fazla hesaba gelen postaları tek bir akışta birleştirir, her postanın hangi hesaba ait olduğunu renkli rozetlerle gösterir.
- **İzole Hesap Yönetimi**: Hesaplar arası bağımsız oturum, güvenli şifreli yerel kasa ve tek tıkla hesap ekleme / onaylı hesap kaldırma yeteneği.
- **Modern Dikey Sidebar Navigasyonu**: Hızlı kategori filtreleme (Gelen Kutusu, Yıldızlılar, Güvenlik Taraması, Bültenler, Spam), hesap seçici ve tek tıkla erişilebilen modern sol menü mimarisi.

#### 🧠 Yapay Zeka (AI) Entegrasyonu & Dinamik Model Seçici
Sift, e-postalarınızı ayrıştırmak, özetlemek ve akıllı yanıtlar üretmek için çoklu yapay zeka motorlarını dinamik olarak seçmenize olanak tanır:
- **Google Gemini (gemini-2.5-flash / gemini-3.8-flash)**: Yüksek hızlı e-posta sınıflandırma, fatura/kargo takip tespiti ve doğal Türkçe dil desteği.
- **OpenAI (GPT-4o)**: Güçlü akıl yürütme, derin e-posta niyet analizi ve otomatik aksiyon önerileri.
- **Anthropic Claude (Claude 3.5 / Claude 3.7 Sonnet)**: Hassas güvenlik denetimi, kimlik avı (phishing) tespiti ve karmaşık e-posta yanıt taslakları.
- **Ollama (Yerel / Tamamen Çevrimdışı / Sıfır Maliyet)**: `localhost:11434` üzerinde çalışan `llama3`, `mistral` veya `qwen` gibi açık modellerle verilerinizi cihazınızdan dışarı çıkarmadan çalışma özgürlüğü.
- **Akıllı Yetenekler**: Tek tıkla otomatik yanıt taslağı oluşturma (Resmi, Kısa, Samimi tonlar), e-posta risk puanlama ve otomatik spam ayrıştırma.

#### 🛡️ Üst Düzey Stabilite ve Hata Toleransı
- **React Error Boundaries**: Arayüzün herhangi bir noktasında oluşabilecek beklenmedik render hatalarını yakalar, tüm uygulamanın çökmesini engeller ve tek tıkla kurtarma butonu sunar.
- **Güvenli Veri Navigasyonu (`?.` ve `|| []`)**: Asenkron IMAP ve AI yanıtlarındaki eksik veya geciken nesne alanlarında null/undefined hatalarını önleyen korumalı erişim desenleri kullanılır.
- **Zod Şema Doğrulaması**: Sunucu ve yapay zeka katmanlarından dönen veriler Zod şemalarından geçirilerek tip uyumsuzluklarının ön yüzü bozması engellenir.

---

### 4. Kurulum ve Çalıştırma

#### Gereksinimler
- **Node.js**: v20.x veya üzeri
- **npm**: v10.x veya üzeri
- *(İsteğe bağlı)* Yerel yapay zeka için [Ollama](https://ollama.com/).

#### Adım Adım Kurulum

```bash
# 1. Projeyi klonlayın
git clone https://github.com/kullanici-adiniz/sift.git
cd sift

# 2. Bağımlılıkları yükleyin
npm install

# 3. Ortam değişkenlerini yapılandırın
cp .env.example .env

# 4. Geliştirme sunucusunu başlatın
npm run dev
```
Uygulama tarayıcınızda `http://localhost:3000` adresinde çalışacaktır.

---

### 5. Derleme (Build) ve Prodüksiyon Başlatma

Ön yüzü Vite ile derleyip arka yüz sunucusunu tek bir CommonJS dosyasında (`dist/server.cjs`) toplamak için:

```bash
# Prodüksiyon derlemesini oluştur (Vite + esbuild dist/server.cjs)
npm run build

# Prodüksiyon sunucusunu başlat
npm run start
```

---

## License / Lisans

Distributed under the MIT License. See `LICENSE` for more information.  
MIT Lisansı altında dağıtılmaktadır. Daha fazla bilgi için `LICENSE` dosyasına göz atabilirsiniz.
