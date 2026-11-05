import React from 'react';
import { Cpu } from 'lucide-react';
import { Link } from '@/i18n/routing';

interface LogoProps {
  href?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Logo({ href = '/', size = 'md', className = '' }: LogoProps) {
  const iconSizes = {
    sm: 'size-5',
    md: 'size-6',
    lg: 'size-8',
  };

  const textSizes = {
    sm: 'text-base font-bold',
    md: 'text-lg font-bold tracking-tight',
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
      className={`inline-flex items-center gap-2 group transition-opacity hover:opacity-90 ${className}`}
      aria-label="DigitalDepot Home"
    >
      <div
        className={`${badgeSizes[size]} bg-primary text-primary-foreground shadow-sm flex items-center justify-center transition-transform group-hover:scale-105`}
      >
        <Cpu className={`${iconSizes[size]}`} />
      </div>
      <div className="flex flex-col leading-none">
        <span className={`${textSizes[size]} text-foreground flex items-center`}>
          Digital<span className="text-primary ml-0.5">Depot</span>
        </span>
        <span className="text-[10px] tracking-widest text-muted-foreground uppercase font-medium mt-0.5">
          Electronics BD
        </span>
      </div>
    </Link>
  );
}
