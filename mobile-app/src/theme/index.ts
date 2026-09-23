/**
 * DRS AI Mobile — Theme tokens (dark-first design)
 */

export const colors = {
  dark: {
    bg: '#0a0a0a',
    surface: '#161616',
    surfaceAlt: '#1f1f1f',
    border: '#2a2a2a',
    text: '#f5f5f5',
    textSecondary: '#a0a0a0',
    textMuted: '#707070',
    accent: '#6366f1',
    accentAlt: '#8b5cf6',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
    glow: 'rgba(99, 102, 241, 0.4)',
  },
  light: {
    bg: '#fafafa',
    surface: '#ffffff',
    surfaceAlt: '#f3f3f3',
    border: '#e5e5e5',
    text: '#0a0a0a',
    textSecondary: '#404040',
    textMuted: '#707070',
    accent: '#6366f1',
    accentAlt: '#8b5cf6',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
    glow: 'rgba(99, 102, 241, 0.2)',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const typography = {
  fontFamily: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
    mono: 'monospace',
  },
  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
    display: 36,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeight: {
    tight: 1.2,
    regular: 1.5,
    relaxed: 1.75,
  },
};

export const shadows = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 1 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 5 },
  glow: { shadowColor: colors.dark.accent, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 4 },
};

export type ThemeColors = typeof colors.dark;
