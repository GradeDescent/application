'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { gravatarUrl } from '@/lib/gravatar';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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
          {!user ? (
            <>
              <Button asChild variant="ghost">
                <Link href="/register">Sign up</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/login">Log in</Link>
              </Button>
            </>
          ) : (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm text-foreground shadow-sm transition hover:border-border"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <img
                  src={gravatarUrl(user.email, 64)}
                  alt={user.name || user.email}
                  className="h-7 w-7 rounded-full border border-border"
                />
                <span className="hidden text-sm font-medium md:inline">{user.name || user.email}</span>
              </button>
              {menuOpen ? (
                <div className="absolute right-0 mt-2 w-48 rounded-lg border border-border/70 bg-background shadow-lg">
                  <div className="border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
                    Signed in as
                    <div className="truncate font-semibold text-foreground">{user.email}</div>
                  </div>
                  <div className="flex flex-col p-2 text-sm">
                    <Link
                      className="rounded-md px-2 py-1.5 transition hover:bg-muted"
                      href="/profile"
                      onClick={() => setMenuOpen(false)}
                    >
                      Profile
                    </Link>
                    <button
                      type="button"
                      className="rounded-md px-2 py-1.5 text-left transition hover:bg-muted"
                      onClick={() => {
                        setMenuOpen(false);
                        logout();
                      }}
                    >
                      Log out
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
