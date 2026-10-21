import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Lightweight i18n inspired by drsai's single-dictionary approach.
 * - One nested dictionary per language (no heavy dependency).
 * - Dot-notation lookup with English fallback.
 * - Persists the choice to localStorage (`drs-lang`).
 * - Sets <html lang> and <html dir> (RTL for Arabic).
 */

export type Lang = 'ar' | 'en' | 'fr' | 'de';

export type Dir = 'ltr' | 'rtl';

const STORAGE_KEY = 'drs-lang';

interface LangMeta {
  value: Lang;
  label: string; // native label shown in the switcher
  flag: string;
  dir: Dir;
}

export const LANGS: LangMeta[] = [
  { value: 'en', label: 'English', flag: '🇬🇧', dir: 'ltr' },
  { value: 'ar', label: 'العربية', flag: '🇸🇦', dir: 'rtl' },
  { value: 'fr', label: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { value: 'de', label: 'Deutsch', flag: '🇩🇪', dir: 'ltr' },
];

const en = {
  nav: {
    chat: 'Chat',
    projects: 'Projects',
    files: 'Files',
    voice: 'Voice',
    models: 'Models',
    analytics: 'Analytics',
    settings: 'Settings',
    admin: 'Admin',
  },
  auth: {
    signIn: 'Sign in',
    email: 'Email',
    password: 'Password',
    register: 'Register',
    logout: 'Logout',
    twoFactor: 'Two-factor authentication',
  },
  chat: {
    sendMessage: 'Send message',
    newChat: 'New Chat',
    thinking: 'Thinking…',
    stop: 'Stop generating',
    placeholder: 'Type your message...',
    emptyTitle: 'How can I help you today?',
    emptySubtitle: 'Start a conversation with the AI assistant',
    selectModel: 'Select model',
    newConversation: 'New Conversation',
    sendFailed: 'Failed to send message',
    loadModelsFailed: 'Failed to load models',
    loadConversationsFailed: 'Failed to load conversations',
    loadConversationFailed: 'Failed to load conversation',
    createConversationFailed: 'Failed to create conversation',
    deleteConversationFailed: 'Failed to delete conversation',
    streamingStopped: 'Generation stopped',
  },
  header: {
    welcome: 'Welcome back',
    notifications: 'Notifications',
    toggleTheme: 'Toggle theme',
  },
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    loading: 'Loading',
    language: 'Language',
    theme: 'Theme',
  },
};

export type Dictionary = typeof en;

const ar: Dictionary = {
  nav: {
    chat: 'دردشة',
    projects: 'المشاريع',
    files: 'الملفات',
    voice: 'الصوت',
    models: 'النماذج',
    analytics: 'التحليلات',
    settings: 'الإعدادات',
    admin: 'الإدارة',
  },
  auth: {
    signIn: 'تسجيل الدخول',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    register: 'إنشاء حساب',
    logout: 'تسجيل الخروج',
    twoFactor: 'التحقق بخطوتين',
  },
  chat: {
    sendMessage: 'إرسال الرسالة',
    newChat: 'محادثة جديدة',
    thinking: 'جارٍ التفكير…',
    stop: 'إيقاف التوليد',
    placeholder: 'اكتب رسالتك...',
    emptyTitle: 'كيف يمكنني مساعدتك اليوم؟',
    emptySubtitle: 'ابدأ محادثة مع المساعد الذكي',
    selectModel: 'اختر نموذجًا',
    newConversation: 'محادثة جديدة',
    sendFailed: 'فشل إرسال الرسالة',
    loadModelsFailed: 'فشل تحميل النماذج',
    loadConversationsFailed: 'فشل تحميل المحادثات',
    loadConversationFailed: 'فشل تحميل المحادثة',
    createConversationFailed: 'فشل إنشاء المحادثة',
    deleteConversationFailed: 'فشل حذف المحادثة',
    streamingStopped: 'تم إيقاف التوليد',
  },
  header: {
    welcome: 'مرحبًا بعودتك',
    notifications: 'الإشعارات',
    toggleTheme: 'تبديل المظهر',
  },
  common: {
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'حذف',
    loading: 'جارٍ التحميل',
    language: 'اللغة',
    theme: 'المظهر',
  },
};

const fr: Dictionary = {
  nav: {
    chat: 'Chat',
    projects: 'Projets',
    files: 'Fichiers',
    voice: 'Vocal',
    models: 'Modèles',
    analytics: 'Analyses',
    settings: 'Paramètres',
    admin: 'Admin',
  },
  auth: {
    signIn: 'Se connecter',
    email: 'E-mail',
    password: 'Mot de passe',
    register: "S'inscrire",
    logout: 'Se déconnecter',
    twoFactor: 'Authentification à deux facteurs',
  },
  chat: {
    sendMessage: 'Envoyer le message',
    newChat: 'Nouvelle discussion',
    thinking: 'Réflexion…',
    stop: 'Arrêter la génération',
    placeholder: 'Tapez votre message...',
    emptyTitle: "Comment puis-je vous aider aujourd'hui ?",
    emptySubtitle: "Démarrez une conversation avec l'assistant IA",
    selectModel: 'Sélectionner un modèle',
    newConversation: 'Nouvelle conversation',
    sendFailed: "Échec de l'envoi du message",
    loadModelsFailed: 'Échec du chargement des modèles',
    loadConversationsFailed: 'Échec du chargement des conversations',
    loadConversationFailed: 'Échec du chargement de la conversation',
    createConversationFailed: 'Échec de la création de la conversation',
    deleteConversationFailed: 'Échec de la suppression de la conversation',
    streamingStopped: 'Génération arrêtée',
  },
  header: {
    welcome: 'Bon retour',
    notifications: 'Notifications',
    toggleTheme: 'Changer de thème',
  },
  common: {
    save: 'Enregistrer',
    cancel: 'Annuler',
    delete: 'Supprimer',
    loading: 'Chargement',
    language: 'Langue',
    theme: 'Thème',
  },
};

const de: Dictionary = {
  nav: {
    chat: 'Chat',
    projects: 'Projekte',
    files: 'Dateien',
    voice: 'Sprache',
    models: 'Modelle',
    analytics: 'Analysen',
    settings: 'Einstellungen',
    admin: 'Admin',
  },
  auth: {
    signIn: 'Anmelden',
    email: 'E-Mail',
    password: 'Passwort',
    register: 'Registrieren',
    logout: 'Abmelden',
    twoFactor: 'Zwei-Faktor-Authentifizierung',
  },
  chat: {
    sendMessage: 'Nachricht senden',
    newChat: 'Neuer Chat',
    thinking: 'Denkt nach…',
    stop: 'Generierung stoppen',
    placeholder: 'Nachricht eingeben...',
    emptyTitle: 'Wie kann ich Ihnen heute helfen?',
    emptySubtitle: 'Starten Sie ein Gespräch mit dem KI-Assistenten',
    selectModel: 'Modell auswählen',
    newConversation: 'Neue Unterhaltung',
    sendFailed: 'Nachricht konnte nicht gesendet werden',
    loadModelsFailed: 'Modelle konnten nicht geladen werden',
    loadConversationsFailed: 'Unterhaltungen konnten nicht geladen werden',
    loadConversationFailed: 'Unterhaltung konnte nicht geladen werden',
    createConversationFailed: 'Unterhaltung konnte nicht erstellt werden',
    deleteConversationFailed: 'Unterhaltung konnte nicht gelöscht werden',
    streamingStopped: 'Generierung gestoppt',
  },
  header: {
    welcome: 'Willkommen zurück',
    notifications: 'Benachrichtigungen',
    toggleTheme: 'Design wechseln',
  },
  common: {
    save: 'Speichern',
    cancel: 'Abbrechen',
    delete: 'Löschen',
    loading: 'Wird geladen',
    language: 'Sprache',
    theme: 'Design',
  },
};

const dictionaries: Record<Lang, Dictionary> = { en, ar, fr, de };

/** Walk a nested dictionary using a dot-notation key. */
function resolve(dict: Dictionary | undefined, key: string): string | undefined {
  if (!dict) return undefined;
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function isLang(value: unknown): value is Lang {
  return value === 'ar' || value === 'en' || value === 'fr' || value === 'de';
}

function getInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* localStorage unavailable */
  }
  return 'en';
}

interface I18nContextValue {
  lang: Lang;
  dir: Dir;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang);

  // Persist the choice and apply directionality to <html>.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* localStorage unavailable */
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
  }, []);

  const t = useCallback(
    (key: string): string =>
      resolve(dictionaries[lang], key) ?? resolve(dictionaries.en, key) ?? key,
    [lang]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ lang, dir: lang === 'ar' ? 'rtl' : 'ltr', setLang, t }),
    [lang, setLang, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
}

/** Convenience hook: returns only the translator. */
export function useT() {
  return useI18n().t;
}
