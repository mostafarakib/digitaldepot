'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Laptop } from 'lucide-react';
import { Button } from '@/components/ui/button';

const emptySubscribe = () => () => {};

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 px-0 ${className}`}
        aria-label="Toggle theme"
      >
        <span className="size-4" />
      </Button>
    );
  }

  const cycleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('system');
    } else {
      setTheme('light');
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={cycleTheme}
      className={`h-8 px-2 text-xs font-medium gap-1.5 ${className}`}
      title={`Current: ${theme} (click to toggle light / dark / system)`}
      aria-label={`Current theme: ${theme}. Click to change theme.`}
    >
      {theme === 'light' && <Sun className="size-3.5 text-amber-500" />}
      {theme === 'dark' && <Moon className="size-3.5 text-blue-400" />}
      {theme === 'system' && <Laptop className="size-3.5 text-muted-foreground" />}
      <span className="capitalize hidden sm:inline">{theme}</span>
    </Button>
  );
}
