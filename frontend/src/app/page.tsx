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
<PageShell className="relative overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(66,129,164,0.28),transparent_55%),radial-gradient(circle_at_bottom,_rgba(212,180,131,0.22),transparent_60%)]">
  {/* subtle decorative blobs */}
  <div className="pointer-events-none absolute inset-0">
    <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-[rgba(72,169,166,0.22)] blur-3xl" />
    <div className="absolute -right-28 top-32 h-80 w-80 rounded-full bg-[rgba(193,102,107,0.16)] blur-3xl" />
    <div className="absolute bottom-0 left-1/2 h-96 w-[40rem] -translate-x-1/2 rounded-full bg-[rgba(228,223,218,0.22)] blur-3xl" />
    <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.04),transparent_40%,rgba(0,0,0,0.02))]" />
  </div>

  <main className="relative mx-auto flex max-w-6xl flex-1 flex-col items-center gap-10 px-6 py-16 text-center sm:py-24">
    {/* BIG logo + name */}
    <div className="flex flex-col items-center gap-6">
      <img
        src="/logo.svg"
        alt="GradeDescent"
        className="w-[min(80vw,32rem)] h-auto drop-shadow-sm"
      />

      <div className="max-w-3xl space-y-4">
        <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
          A workspace for math-centric courses: publish assignments, collect student submissions,
          and track automated evaluations end-to-end—and without vendor lock-in.
        </p>
      </div>
    </div>

    {/* CTAs */}
    <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
      <Button asChild size="lg" className="w-full sm:w-auto">
        <Link href="/login">Sign in</Link>
      </Button>
      <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
        <Link href="/register">Create account</Link>
      </Button>
      <Button asChild variant="ghost" size="lg" className="w-full sm:w-auto">
        <a href="https://github.com/GradeDescent/application" target="_blank" rel="noreferrer">
          View on GitHub
        </a>
      </Button>
    </div>

    {/* Feature grid */}
    <section className="w-full max-w-5xl">
      <div className="grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border bg-background/70 p-5 shadow-sm backdrop-blur">
          <div className="mb-3 inline-flex items-center gap-2 text-sm font-medium">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[rgba(66,129,164,0.9)]" />
            Assignments → Submissions → Evaluations
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            A single, readable flow. Every evaluation is tied to the exact submission artifact that produced it.
          </p>
        </div>

        <div className="rounded-2xl border bg-background/70 p-5 shadow-sm backdrop-blur">
          <div className="mb-3 inline-flex items-center gap-2 text-sm font-medium">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[rgba(72,169,166,0.9)]" />
            Math-first artifacts
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Accept TeX or PDF uploads, keep originals, and track derived artifacts (rasterized pages, extracted text,
            rubric-aligned outputs).
          </p>
        </div>

        <div className="rounded-2xl border bg-background/70 p-5 shadow-sm backdrop-blur">
          <div className="mb-3 inline-flex items-center gap-2 text-sm font-medium">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[rgba(212,180,131,0.95)]" />
            Transparent grading workflows
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Keep your process inspectable: inputs, model runs, and evaluation results stay auditable and course-scoped.
          </p>
        </div>

        <div className="rounded-2xl border bg-background/70 p-5 shadow-sm backdrop-blur">
          <div className="mb-3 inline-flex items-center gap-2 text-sm font-medium">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[rgba(193,102,107,0.9)]" />
            Role-based access
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Owners, instructors, and TAs manage courses. Students submit work and view results according to policy.
          </p>
        </div>

        <div className="rounded-2xl border bg-background/70 p-5 shadow-sm backdrop-blur">
          <div className="mb-3 inline-flex items-center gap-2 text-sm font-medium">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-foreground/80" />
            Self-hosted by design
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Run it on your own infrastructure. Keep control of data, storage, and model credentials.
          </p>
        </div>

        <div className="rounded-2xl border bg-background/70 p-5 shadow-sm backdrop-blur">
          <div className="mb-3 inline-flex items-center gap-2 text-sm font-medium">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted-foreground/70" />
            Built for iteration
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Ship improvements quickly: clean APIs, predictable primitives, and a UI that stays out of the way.
          </p>
        </div>
      </div>

      {/* small secondary text */}
      <div className="mx-auto mt-8 max-w-3xl text-center">
        <p className="text-sm text-muted-foreground">
          GradeDescent is optimized for math-heavy courses. You can always trace an evaluation
          back to the exact student work that produced it.
        </p>
      </div>
    </section>

    {/* Bottom CTA */}
    <div className="w-full max-w-5xl">
      <div className="mt-4 flex flex-col items-center justify-between gap-4 rounded-2xl border bg-background/70 px-6 py-6 text-left shadow-sm backdrop-blur sm:flex-row">
        <div className="space-y-1">
          <div className="text-sm font-medium">Ready to try it?</div>
          <div className="text-sm text-muted-foreground">
            Create an account, spin up a course, and run your first evaluation pipeline.
          </div>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/register">Create account</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </div>
  </main>
</PageShell>
  );
}
