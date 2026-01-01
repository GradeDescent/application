'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

export function SiteHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { user, logout } = useAuth();

  return (
    <header className="border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/courses" className="flex items-center gap-3">
            <img src="/logo.svg" alt="GradeDescent" className="h-10 w-10" />
            <div>
              <p className="text-lg font-semibold">GradeDescent</p>
              <p className="text-xs text-muted-foreground">{subtitle || title}</p>
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {user ? <span className="text-xs text-muted-foreground">{user.email}</span> : null}
          <Button variant="outline" onClick={logout}>
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
