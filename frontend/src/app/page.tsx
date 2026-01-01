'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { PageShell } from '@/components/page-shell';

export default function Home() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      window.location.href = '/courses';
    }
  }, [isLoading, user]);

  if (isLoading || user) return null;

  return (
    <PageShell className="bg-[radial-gradient(circle_at_top,_rgba(66,129,164,0.25),transparent_55%),radial-gradient(circle_at_bottom,_rgba(212,180,131,0.2),transparent_60%)]">
      <main className="mx-auto flex max-w-5xl flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
        <img src="/logo.svg" alt="GradeDescent" className="h-28 w-28" />
        <div className="max-w-2xl space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight">GradeDescent</h1>
          <p className="text-base text-muted-foreground">
            A focused workspace for math-centric courses. Publish assignments, collect student submissions, and track
            automated evaluations in one clean flow.
          </p>
          <p className="text-sm text-muted-foreground">
            Built for self-hosting and transparent grading workflows—no vendor lock-in.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/register">Create account</Link>
          </Button>
        </div>
      </main>
    </PageShell>
  );
}
