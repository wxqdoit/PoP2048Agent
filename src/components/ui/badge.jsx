import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const badgeVariants = cva('inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold', {
  variants: {
    variant: {
      default: 'border-transparent bg-primary text-primary-foreground',
      secondary: 'border-transparent bg-secondary text-secondary-foreground',
      outline: 'border-border bg-background text-foreground',
      success: 'border-transparent bg-emerald-600 text-white',
      warning: 'border-transparent bg-amber-500 text-slate-950'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
});

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

