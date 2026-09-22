import React from 'react';
import { cn } from '@/lib/utils';

interface GlassBadgeProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple';
  size?: 'sm' | 'md';
}

export const GlassBadge: React.FC<GlassBadgeProps> = ({
  children,
  className,
  variant = 'default',
  size = 'md'
}) => {
  const variants = {
    default: 'bg-white/10 text-white border-white/20',
    success: 'bg-green-500/20 text-green-300 border-green-500/30',
    warning: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    error: 'bg-red-500/20 text-red-300 border-red-500/30',
    info: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm'
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-lg backdrop-blur-sm border font-medium',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  );
};
