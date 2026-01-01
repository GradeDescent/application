'use client';

import { useParams } from 'next/navigation';
import { AuthGuard } from '@/components/auth-guard';
import { SiteHeader } from '@/components/site-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { useAssignments } from '@/lib/queries';

export default function AssignmentsPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = Array.isArray(params.courseId) ? params.courseId[0] : params.courseId;
  const assignmentsQuery = useAssignments(courseId);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[linear-gradient(120deg,_rgba(72,169,166,0.12),transparent_45%),linear-gradient(240deg,_rgba(66,129,164,0.1),transparent_45%)]">
        <SiteHeader title="Assignments" subtitle={`Course ${courseId}`} />
        <main className="mx-auto max-w-5xl px-6 py-8">
          <div className="grid gap-4">
            {assignmentsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading assignments...</p>
            ) : assignmentsQuery.isError ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-destructive">
                  Failed to load assignments.
                </CardContent>
              </Card>
            ) : assignmentsQuery.data?.items.length ? (
              assignmentsQuery.data.items.map((assignment) => (
                <Card key={assignment.id} className="border-none bg-card/90 shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{assignment.title}</span>
                      <span className="text-xs text-muted-foreground">{assignment.status}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Total points: {assignment.totalPoints}</p>
                    <Button asChild>
                      <Link href={`/courses/${courseId}/assignments/${assignment.id}`}>Open</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No assignments yet.
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
