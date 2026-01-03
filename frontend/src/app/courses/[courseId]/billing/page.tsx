'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AuthGuard } from '@/components/auth-guard';
import { PageShell } from '@/components/page-shell';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch, ApiError } from '@/lib/apiClient';
import { useCourse } from '@/lib/queries';

type CourseBilling = {
  courseId: string;
  accountId: string;
  balance: { currency: string; balanceMicrodollars: number };
  rates?: { metric: string; unitPriceMicrodollars: number }[];
};

type LedgerEntry = {
  id: string;
  type: 'CREDIT' | 'CHARGE' | 'REFUND' | 'ADJUSTMENT';
  amountMicrodollars: number;
  meta?: Record<string, unknown>;
  createdAt: string;
};

const MICRODOLLARS_PER_USD = 1_000_000;
const LEDGER_PAGE_SIZE = 10;

function formatUsd(microdollars: number) {
  return (microdollars / MICRODOLLARS_PER_USD).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export default function CourseBillingPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = Array.isArray(params.courseId) ? params.courseId[0] : params.courseId;

  const billingQuery = useQuery({
    queryKey: ['course-billing', courseId],
    queryFn: async () => apiFetch<CourseBilling>(`/courses/${courseId}/billing`),
    enabled: !!courseId,
  });

  const courseQuery = useCourse(courseId);

  const accountId = billingQuery.data?.accountId;

  const [ledgerCursor, setLedgerCursor] = useState<string | null>(null);
  const [prevCursors, setPrevCursors] = useState<string[]>([]);

  const ledgerQuery = useQuery({
    queryKey: ['account-ledger', accountId, ledgerCursor],
    queryFn: async () =>
      apiFetch<{ items: LedgerEntry[]; next_cursor?: string | null }>(
        `/billing/accounts/${accountId}/ledger?limit=${LEDGER_PAGE_SIZE}${ledgerCursor ? `&cursor=${encodeURIComponent(ledgerCursor)}` : ''}`,
      ),
    enabled: !!accountId,
  });

  const balance = billingQuery.data?.balance;
  const ledgerItems = ledgerQuery.data?.items ?? [];
  const ledgerNextCursor = ledgerQuery.data?.next_cursor ?? null;
  const rates = billingQuery.data?.rates ?? [];
  const balanceDisplay = balance ? formatUsd(balance.balanceMicrodollars) : '—';
  const balanceTone =
    balance && balance.balanceMicrodollars < 0 ? 'text-destructive' : 'text-foreground';

  const errorMessage = useMemo(() => {
    if (billingQuery.error instanceof ApiError) return billingQuery.error.message;
    if (ledgerQuery.error instanceof ApiError) return ledgerQuery.error.message;
    return null;
  }, [billingQuery.error, ledgerQuery.error]);

  return (
    <AuthGuard>
      <PageShell className="bg-[linear-gradient(130deg,_rgba(66,129,164,0.12),transparent_45%),linear-gradient(230deg,_rgba(212,180,131,0.14),transparent_45%)]">
        <SiteHeader
          title="Account billing"
          subtitle="Current balance and recent ledger activity"
          breadcrumbs={[
            { label: 'Courses', href: '/courses' },
            { label: courseQuery.data?.title || 'Course', href: `/courses/${courseId}` },
            { label: 'Billing' },
          ]}
        />

        <main className="mx-auto flex max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
          <Card className="border-none bg-card/90 shadow">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Balance</CardTitle>
                <p className="text-sm text-muted-foreground">Course balance overview</p>
              </div>
              <Button asChild variant="outline">
                <Link href={`/courses/${courseId}`}>Back to course</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {billingQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading balance...</p>
              ) : billingQuery.isError ? (
                <p className="text-sm text-destructive">Failed to load balance.</p>
              ) : (
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className={`text-2xl font-semibold ${balanceTone}`}>{balanceDisplay}</p>
                  {balance ? (
                    <p className="text-xs text-muted-foreground">
                      {balance.balanceMicrodollars.toLocaleString()} µ$
                    </p>
                  ) : null}
                </div>
              )}
              {errorMessage ? <p className="mt-3 text-sm text-destructive">{errorMessage}</p> : null}
            </CardContent>
          </Card>

          <Card className="border-none bg-card/90 shadow">
            <CardHeader>
              <CardTitle>Rate card</CardTitle>
            </CardHeader>
            <CardContent>
              {billingQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading rate card...</p>
              ) : rates.length ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {rates.map((rate) => (
                    <div key={rate.metric} className="rounded-md border border-border/60 bg-background/60 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {rate.metric.replace('_', ' ')}
                      </p>
                      <p className="text-lg font-semibold text-foreground">{formatUsd(rate.unitPriceMicrodollars)}</p>
                      <p className="text-xs text-muted-foreground">{rate.unitPriceMicrodollars.toLocaleString()} µ$</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Rate card unavailable.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-none bg-card/90 shadow">
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Ledger</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const prev = prevCursors[prevCursors.length - 1];
                    if (prev !== undefined) {
                      setPrevCursors(prevCursors.slice(0, -1));
                      setLedgerCursor(prev || null);
                    }
                  }}
                  disabled={!prevCursors.length || ledgerQuery.isLoading}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (ledgerNextCursor) {
                      setPrevCursors([...prevCursors, ledgerCursor || '']);
                      setLedgerCursor(ledgerNextCursor);
                    }
                  }}
                  disabled={!ledgerNextCursor || ledgerQuery.isLoading}
                >
                  Next
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {ledgerQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading ledger...</p>
              ) : ledgerQuery.isError ? (
                <p className="text-sm text-destructive">Failed to load ledger.</p>
              ) : ledgerItems.length ? (
                <div className="divide-y divide-border/60">
                  {ledgerItems.map((entry) => (
                    <div key={entry.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">{entry.type}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">
                          {formatUsd(entry.amountMicrodollars)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.amountMicrodollars.toLocaleString()} µ$
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No ledger entries yet.</p>
              )}
            </CardContent>
          </Card>
        </main>
      </PageShell>
    </AuthGuard>
  );
}
