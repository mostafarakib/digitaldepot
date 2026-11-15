import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  isRetrying?: boolean;
}

export function ErrorState({
  title,
  message,
  onRetry,
  retryLabel = 'Retry',
  isRetrying = false,
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center text-center p-6 sm:p-8 rounded-2xl border border-destructive/20 bg-destructive/5 text-destructive space-y-3.5',
        className,
      )}
      {...props}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive shrink-0">
        <AlertTriangle className="size-6" />
      </div>
      <div className="space-y-1 max-w-sm mx-auto">
        {title && <h3 className="text-sm font-semibold text-destructive">{title}</h3>}
        <p className="text-xs text-destructive/90 leading-relaxed">{message}</p>
      </div>
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={isRetrying}
          className="text-xs border-destructive/30 hover:bg-destructive/10 text-destructive gap-1.5 cursor-pointer mt-1"
        >
          <RefreshCw className={cn('size-3.5', isRetrying && 'animate-spin')} />
          <span>{retryLabel}</span>
        </Button>
      )}
    </div>
  );
}
