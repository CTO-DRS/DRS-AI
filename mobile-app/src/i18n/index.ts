import * as Localization from 'expo-localization';
import { I18n } from 'i18n-js';

import { ar } from './locales/ar';
import { en } from './locales/en';
import { fr } from './locales/fr';
import { de } from './locales/de';
import type { Locale } from '../types';

const i18n = new I18n({ ar, en, fr, de }, { enableFallback: true });

const RTL_LOCALES: Locale[] = ['ar'];

export function getDeviceLocale(): Locale {
  const raw = Localization.getLocales?.()[0]?.languageCode || 'en';
  if (raw === 'ar' || raw === 'en' || raw === 'fr' || raw === 'de') return raw;
  return 'en';
}

export function isRTL(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function setLocale(locale: Locale) {
  i18n.locale = locale;
}

export function t(scope: string, options?: Record<string, unknown>): string {
  return i18n.t(scope, options) as string;
}

export function getCurrentLocale(): Locale {
  return (i18n.locale.split('-')[0] as Locale) || 'en';
}

export const supportedLocales: { code: Locale; name: string; flag: string }[] = [
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
];

// Initialize with device locale
setLocale(getDeviceLocale());

export default i18n;
