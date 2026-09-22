import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface GlassButtonProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'glow';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  icon?: React.ReactNode;
}

export const GlassButton: React.FC<GlassButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
  type = 'button',
  icon
}) => {
  const variants = {
    primary: 'bg-gradient-to-r from-cyan-500/80 to-blue-600/80 text-white border border-white/20 hover:from-cyan-500 hover:to-blue-600',
    secondary: 'bg-white/10 text-white border border-white/20 hover:bg-white/20',
    danger: 'bg-gradient-to-r from-red-500/80 to-pink-600/80 text-white border border-white/20 hover:from-red-500 hover:to-pink-600',
    ghost: 'bg-transparent text-white/70 hover:text-white hover:bg-white/5',
    glow: 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-lg shadow-cyan-500/30 hover:bg-cyan-500/30 hover:shadow-cyan-500/50'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'rounded-xl backdrop-blur-md font-medium transition-all duration-300',
        'flex items-center justify-center gap-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'active:scale-95',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {!loading && icon}
      {children}
    </button>
  );
};
