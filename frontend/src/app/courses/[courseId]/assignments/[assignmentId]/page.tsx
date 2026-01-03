'use client';

import { useParams } from 'next/navigation';
import { AuthGuard } from '@/components/auth-guard';
import { SubmissionWidget } from '@/components/submission-widget';
import { SiteHeader } from '@/components/site-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAssignment, useCourse, useSubmissions } from '@/lib/queries';
import { PageShell } from '@/components/page-shell';

export default function AssignmentDetailPage() {
  const params = useParams<{ courseId: string; assignmentId: string }>();
  const courseId = Array.isArray(params.courseId) ? params.courseId[0] : params.courseId;
  const assignmentId = Array.isArray(params.assignmentId) ? params.assignmentId[0] : params.assignmentId;
  const assignmentQuery = useAssignment(courseId, assignmentId);
  const submissionsQuery = useSubmissions(assignmentId);
  const courseQuery = useCourse(courseId);
  const prettySource = assignmentQuery.data?.sourceTex
    ? prettyPrintTex(assignmentQuery.data.sourceTex)
    : '';

  return (
    <AuthGuard>
      <PageShell className="bg-[linear-gradient(120deg,_rgba(212,180,131,0.2),transparent_50%),linear-gradient(240deg,_rgba(72,169,166,0.12),transparent_45%)]">
        <SiteHeader
          title="Assignment"
          subtitle={`Course ${courseId}`}
          breadcrumbs={[
            { label: 'Courses', href: '/courses' },
            { label: courseQuery.data?.title || 'Course', href: `/courses/${courseId}` },
            { label: 'Assignments', href: `/courses/${courseId}/assignments` },
            { label: assignmentQuery.data?.title || 'Assignment' },
          ]}
        />

        <main className="mx-auto grid max-w-5xl flex-1 gap-6 px-6 py-8 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            {assignmentQuery.isLoading ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Loading assignment...
                </CardContent>
              </Card>
            ) : assignmentQuery.isError ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-destructive">
                  Failed to load assignment.
                </CardContent>
              </Card>
            ) : assignmentQuery.data ? (
              <>
                <Card className="border-none bg-card/90 shadow">
                  <CardHeader>
                    <CardTitle>{assignmentQuery.data.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">Total points: {assignmentQuery.data.totalPoints}</p>
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">Source TeX</h3>
                      <pre className="max-h-[520px] w-full max-w-3xl overflow-auto rounded-md border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
                        <code>{prettySource}</code>
                      </pre>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-none bg-card/90 shadow">
                  <CardHeader>
                    <CardTitle>Submissions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {submissionsQuery.isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading submissions...</p>
                    ) : submissionsQuery.isError ? (
                      <p className="text-sm text-destructive">Failed to load submissions.</p>
                    ) : submissionsQuery.data?.items.length ? (
                      <div className="divide-y divide-border/60">
                        {submissionsQuery.data.items.map((submission) => (
                          <div key={submission.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold">Submission #{submission.number}</p>
                              <p className="text-xs text-muted-foreground">
                                Student: {submission.user?.name || submission.user?.email || submission.userId}
                              </p>
                              {submission.user?.email ? (
                                <p className="text-xs text-muted-foreground">{submission.user.email}</p>
                              ) : null}
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              <p>Status: {submission.status}</p>
                              {submission.submittedAt ? (
                                <p>{new Date(submission.submittedAt).toLocaleString()}</p>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No submissions yet.</p>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Assignment not found.
                </CardContent>
              </Card>
            )}
          </div>
          {assignmentQuery.data ? <SubmissionWidget assignmentId={assignmentId} /> : null}
        </main>
      </PageShell>
    </AuthGuard>
  );
}

function prettyPrintTex(source: string) {
  const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const expanded = normalized
    .replace(/\\begin{([^}]+)}/g, '\n\\begin{$1}\n')
    .replace(/\\end{([^}]+)}/g, '\n\\end{$1}\n')
    .replace(/\\item\b/g, '\n\\item ')
    .replace(/\\\\\s*/g, '\\\\\n');

  const lines = expanded
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let indent = 0;
  const output: string[] = [];

  for (const line of lines) {
    if (line.startsWith('\\end{')) {
      indent = Math.max(0, indent - 1);
    }
    output.push(`${'  '.repeat(indent)}${line}`);
    if (line.startsWith('\\begin{')) {
      indent += 1;
    }
  }

  return output.join('\n');
}
