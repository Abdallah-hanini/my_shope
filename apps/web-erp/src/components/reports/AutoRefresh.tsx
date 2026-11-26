'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Re-renders the page every few seconds while `active` (exports being prepared). */
export function AutoRefresh({ active, everyMs = 2000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [active, everyMs, router]);
  return null;
}
