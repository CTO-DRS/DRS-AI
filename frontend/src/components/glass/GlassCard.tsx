import React from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'elevated' | 'outlined' | 'glow';
  hover?: boolean;
  onClick?: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className,
  variant = 'default',
  hover = false,
  onClick
}) => {
  const variants = {
    default: 'bg-white/5 backdrop-blur-xl border border-white/10',
    elevated: 'bg-white/10 backdrop-blur-2xl border border-white/20 shadow-2xl shadow-black/20',
    outlined: 'bg-transparent backdrop-blur-md border-2 border-white/30',
    glow: 'bg-white/5 backdrop-blur-xl border border-white/20 shadow-lg shadow-cyan-500/20'
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-2xl transition-all duration-300',
        variants[variant],
        hover && 'hover:bg-white/10 hover:scale-[1.02] hover:shadow-xl cursor-pointer',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
};
