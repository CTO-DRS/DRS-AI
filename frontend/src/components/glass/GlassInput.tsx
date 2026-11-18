import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
  ({ className, label, error, icon, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-white/80 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              'w-full bg-white/5 backdrop-blur-md border border-white/20 rounded-xl',
              'text-white placeholder:text-white/40',
              'focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50',
              'transition-all duration-300',
              icon && 'pl-10',
              'px-4 py-2.5',
              error && 'border-red-500/50 focus:ring-red-500/50 focus:border-red-500/50',
              className
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-1 text-sm text-red-400">{error}</p>
        )}
      </div>
    );
  }
);

GlassInput.displayName = 'GlassInput';
