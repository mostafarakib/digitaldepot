import React from 'react';
import { Cpu } from 'lucide-react';
import { Link } from '@/i18n/routing';

interface LogoProps {
  href?: string;
  size?: 'sm' | 'md' | 'lg';
  inverted?: boolean;
  className?: string;
}

export function Logo({
  href = '/',
  size = 'md',
  inverted = false,
  className = '',
}: LogoProps) {
  const iconSizes = {
    sm: 'size-5',
    md: 'size-5 sm:size-6',
    lg: 'size-8',
  };

  const textSizes = {
    sm: 'text-base font-bold',
    md: 'text-base sm:text-lg font-bold tracking-tight',
    lg: 'text-2xl font-extrabold tracking-tight',
  };

  const badgeSizes = {
    sm: 'p-1 rounded-md',
    md: 'p-1.5 rounded-lg',
    lg: 'p-2 rounded-xl',
  };

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 sm:gap-2.5 group transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg shrink-0 ${className}`}
      aria-label="DigitalDepot Home"
    >
      <div
        className={`${badgeSizes[size]} bg-primary text-primary-foreground shadow-sm flex items-center justify-center transition-transform group-hover:scale-105`}
      >
        <Cpu className={`${iconSizes[size]}`} />
      </div>
      <div className="flex flex-col leading-none">
        <span
          className={`${textSizes[size]} flex items-center ${
            inverted ? 'text-white' : 'text-foreground'
          }`}
        >
          Digital
          <span className={inverted ? 'text-blue-400 ml-0.5' : 'text-primary ml-0.5'}>Depot</span>
        </span>
        <span
          className={`hidden sm:block text-[10px] tracking-widest uppercase font-medium mt-0.5 ${
            inverted ? 'text-slate-400' : 'text-muted-foreground'
          }`}
        >
          Electronics Store
        </span>
      </div>
    </Link>
  );
}
