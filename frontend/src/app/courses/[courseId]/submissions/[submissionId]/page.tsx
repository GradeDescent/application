'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AuthGuard } from '@/components/auth-guard';
import { PageShell } from '@/components/page-shell';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch, ApiError } from '@/lib/apiClient';
import { useAssignment, useCourse, useEvaluations, useSubmission, formatScore, useLatestEvaluation } from '@/lib/queries';
import { artifactSchema, type Artifact } from '@/lib/schemas';

export default function SubmissionDetailPage() {
  const params = useParams<{ courseId: string; submissionId: string }>();
  const courseId = Array.isArray(params.courseId) ? params.courseId[0] : params.courseId;
  const submissionId = Array.isArray(params.submissionId) ? params.submissionId[0] : params.submissionId;

  const courseQuery = useCourse(courseId);
  const submissionQuery = useSubmission(submissionId);
  const assignmentId = submissionQuery.data?.assignmentId;
  const assignmentQuery = useAssignment(courseId, assignmentId);
  const evaluationsQuery = useEvaluations(submissionId);
  const latestEval = useLatestEvaluation(evaluationsQuery.data);
  const scoreLabel = formatScore(latestEval || undefined);

  const artifactsQuery = useQuery({
    queryKey: ['submission-artifacts', submissionId],
    queryFn: async () => {
      const data = await apiFetch<{ items: Artifact[] }>(`/submissions/${submissionId}/artifacts`);
      return data.items.map((item) => artifactSchema.parse(item));
    },
    enabled: !!submissionId,
  });

  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloadMutation = useMutation({
    mutationFn: async (artifactId: string) => {
      const data = await apiFetch<{ url: string; expiresAt: string }>(`/artifacts/${artifactId}/download`);
      return data.url;
    },
    onSuccess: (url) => {
      setDownloadError(null);
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    onError: (err) => {
      setDownloadError(err instanceof ApiError ? err.message : 'Failed to create download link.');
    },
  });

  const headerSubtitle = useMemo(() => {
    if (!submissionQuery.data) return `Submission ${submissionId}`;
    return `Submission #${submissionQuery.data.number}`;
  }, [submissionId, submissionQuery.data]);

  return (
    <AuthGuard>
      <PageShell className="bg-[linear-gradient(120deg,_rgba(72,169,166,0.14),transparent_45%),linear-gradient(240deg,_rgba(212,180,131,0.12),transparent_45%)]">
        <SiteHeader
          title="Submission"
          subtitle={headerSubtitle}
          breadcrumbs={[
            { label: 'Courses', href: '/courses' },
            { label: courseQuery.data?.title || 'Course', href: `/courses/${courseId}` },
            { label: 'Assignments', href: `/courses/${courseId}/assignments` },
            { label: assignmentQuery.data?.title || 'Assignment', href: assignmentId ? `/courses/${courseId}/assignments/${assignmentId}` : undefined },
            { label: 'Submission' },
          ]}
        />

        <main className="mx-auto flex max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
          <Card className="border-none bg-card/90 shadow">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Submission overview</CardTitle>
              <Button asChild variant="outline">
                <Link
                  href={
                    assignmentId
                      ? `/courses/${courseId}/assignments/${assignmentId}`
                      : `/courses/${courseId}/assignments`
                  }
                >
                  Back to assignment
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {submissionQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading submission...</p>
              ) : submissionQuery.isError ? (
                <p className="text-sm text-destructive">Failed to load submission.</p>
              ) : submissionQuery.data ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Student</p>
                    <p className="text-sm font-semibold">
                      {submissionQuery.data.user?.name || submissionQuery.data.user?.email || submissionQuery.data.userId}
                    </p>
                    {submissionQuery.data.user?.email ? (
                      <p className="text-xs text-muted-foreground">{submissionQuery.data.user.email}</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                    <p className="text-sm font-semibold">{submissionQuery.data.status}</p>
                    {submissionQuery.data.submittedAt ? (
                      <p className="text-xs text-muted-foreground">
                        Submitted {new Date(submissionQuery.data.submittedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attempt</p>
                    <p className="text-sm font-semibold">#{submissionQuery.data.number}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest score</p>
                    <p className="text-sm font-semibold">{scoreLabel || '—'}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Submission not found.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-none bg-card/90 shadow">
            <CardHeader>
              <CardTitle>Artifacts</CardTitle>
            </CardHeader>
            <CardContent>
              {artifactsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading artifacts...</p>
              ) : artifactsQuery.isError ? (
                <p className="text-sm text-destructive">Failed to load artifacts.</p>
              ) : artifactsQuery.data?.length ? (
                <div className="divide-y divide-border/60">
                  {artifactsQuery.data.map((artifact) => (
                    <div key={artifact.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">{artifact.kind}</p>
                        <p className="text-xs text-muted-foreground">Storage: {artifact.storage}</p>
                        {artifact.sizeBytes ? (
                          <p className="text-xs text-muted-foreground">
                            {(artifact.sizeBytes / 1024).toFixed(1)} KB
                          </p>
                        ) : null}
                      </div>
                      {artifact.kind === 'PDF' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadMutation.mutate(artifact.id)}
                          disabled={downloadMutation.isPending}
                        >
                          Download PDF
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No artifacts yet.</p>
              )}
              {downloadError ? <p className="mt-2 text-sm text-destructive">{downloadError}</p> : null}
            </CardContent>
          </Card>

          <Card className="border-none bg-card/90 shadow">
            <CardHeader>
              <CardTitle>Evaluations</CardTitle>
            </CardHeader>
            <CardContent>
              {evaluationsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading evaluations...</p>
              ) : evaluationsQuery.isError ? (
                <p className="text-sm text-destructive">Failed to load evaluations.</p>
              ) : evaluationsQuery.data?.length ? (
                <div className="divide-y divide-border/60">
                  {evaluationsQuery.data.map((evaluation) => (
                    <div key={evaluation.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">{evaluation.status}</p>
                        <p className="text-xs text-muted-foreground">Model: {evaluation.model || 'default'}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        {evaluation.completedAt ? (
                          <p>{new Date(evaluation.completedAt).toLocaleString()}</p>
                        ) : null}
                        {evaluation.scorePoints != null && evaluation.scoreOutOf != null ? (
                          <p>
                            {evaluation.scorePoints} / {evaluation.scoreOutOf}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No evaluations yet.</p>
              )}
            </CardContent>
          </Card>
        </main>
      </PageShell>
    </AuthGuard>
  );
}
