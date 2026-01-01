'use client';

import { useParams } from 'next/navigation';
import { AuthGuard } from '@/components/auth-guard';
import { LatexBlock } from '@/components/latex-block';
import { SubmissionWidget } from '@/components/submission-widget';
import { SiteHeader } from '@/components/site-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAssignment, useCourse } from '@/lib/queries';
import { PageShell } from '@/components/page-shell';

export default function AssignmentDetailPage() {
  const params = useParams<{ courseId: string; assignmentId: string }>();
  const courseId = Array.isArray(params.courseId) ? params.courseId[0] : params.courseId;
  const assignmentId = Array.isArray(params.assignmentId) ? params.assignmentId[0] : params.assignmentId;
  const assignmentQuery = useAssignment(courseId, assignmentId);
  const courseQuery = useCourse(courseId);

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
              <Card className="border-none bg-card/90 shadow">
                <CardHeader>
                  <CardTitle>{assignmentQuery.data.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">Total points: {assignmentQuery.data.totalPoints}</p>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Source TeX</h3>
                    <LatexBlock tex={assignmentQuery.data.sourceTex} />
                  </div>
                </CardContent>
              </Card>
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
