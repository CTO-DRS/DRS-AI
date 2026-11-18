/**
 * Auth context — stores the current user & session,
 * exposes login / logout actions.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Locale } from '../types';
import * as api from '../services/api';
import { getDeviceLocale, setLocale as setI18nLocale } from '../i18n';

interface AuthContextValue {
  user: User | null;
  isReady: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setLanguage: (locale: Locale) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      const current = await api.getCurrentUser();
      if (current) {
        setUser(current);
        setI18nLocale(current.preferences?.language || getDeviceLocale());
      }
      setIsReady(true);
    })();
  }, []);

  const login = async (username: string, password: string) => {
    const r = await api.login(username, password);
    if (!r.data) throw new Error(r.error || 'Login failed');
    const session = r.data;
    setUser(session.user);
    setI18nLocale(session.user.preferences?.language || getDeviceLocale());
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  const setLanguage = (locale: Locale) => {
    setI18nLocale(locale);
    setUser((prev) => prev ? { ...prev, preferences: { ...prev.preferences, language: locale } } : prev);
  };

  return (
    <AuthContext.Provider value={{ user, isReady, login, logout, setLanguage }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
