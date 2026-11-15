import React from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  children,
  ...props
}: EmptyStateProps) {
  return (
    <div
      role="region"
      aria-label={title}
      className={cn(
        'flex flex-col items-center justify-center text-center p-8 sm:p-12 border border-dashed border-border rounded-2xl bg-card/40',
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary mb-4 shrink-0">
          {icon}
        </div>
      )}
      <div className="space-y-1.5 max-w-sm mx-auto">
        <h3 className="text-base font-semibold text-foreground tracking-tight">{title}</h3>
        {description && (
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>
      {(action || children) && (
        <div className="mt-6 flex items-center gap-3">{action || children}</div>
      )}
    </div>
  );
}
