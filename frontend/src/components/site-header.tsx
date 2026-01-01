'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

type Crumb = { label: string; href?: string };

export function SiteHeader({
  title,
  subtitle,
  breadcrumbs,
}: {
  title: string;
  subtitle?: string;
  breadcrumbs?: Crumb[];
}) {
  const { user, logout } = useAuth();

  return (
    <header className="border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Link href="/courses" className="flex items-center gap-3">
              <img src="/icon.svg" alt="GradeDescent" className="h-10 w-10" />
            </Link>
            <div>
              <p className="text-lg font-semibold">
                <Link href="/courses" className="text-[#c1666b] hover:text-[#c1666b]/80">
                  GradeDescent
                </Link>
              </p>
              {breadcrumbs && breadcrumbs.length ? (
                <nav className="text-xs text-muted-foreground">
                  {breadcrumbs.map((crumb, idx) => (
                    <span key={`${crumb.label}-${idx}`}>
                      {crumb.href ? (
                        <Link className="underline underline-offset-2" href={crumb.href}>
                          {crumb.label}
                        </Link>
                      ) : (
                        <span>{crumb.label}</span>
                      )}
                      {idx < breadcrumbs.length - 1 ? <span className="mx-1">/</span> : null}
                    </span>
                  ))}
                </nav>
              ) : (
                <p className="text-xs text-muted-foreground">{subtitle || title}</p>
              )}
            </div>
          </div>
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
