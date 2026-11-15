import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export interface AdminTableSkeletonProps {
  columns: number;
  rows?: number;
}

export function AdminTableSkeleton({ columns, rows = 6 }: AdminTableSkeletonProps) {
  return (
    <tbody className="divide-y divide-slate-800/60" aria-hidden="true">
      {Array.from({ length: rows }, (_, rowIdx) => (
        <tr key={rowIdx} className="hover:bg-slate-800/20">
          {Array.from({ length: columns }, (_, colIdx) => (
            <td key={colIdx} className="py-3.5 px-4">
              <Skeleton
                className={`h-4 rounded bg-slate-800/80 ${
                  colIdx === 0
                    ? 'w-24'
                    : colIdx === columns - 1
                      ? 'w-16 ml-auto'
                      : colIdx === 1
                        ? 'w-36'
                        : 'w-20'
                }`}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}
