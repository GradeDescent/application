'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AuthGuard } from '@/components/auth-guard';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCourseMembers } from '@/lib/queries';
import { PageShell } from '@/components/page-shell';

export default function CourseStudentsPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = Array.isArray(params.courseId) ? params.courseId[0] : params.courseId;
  const membersQuery = useCourseMembers(courseId);

  return (
    <AuthGuard>
      <PageShell className="bg-[linear-gradient(120deg,_rgba(72,169,166,0.12),transparent_45%),linear-gradient(240deg,_rgba(66,129,164,0.1),transparent_45%)]">
        <SiteHeader title="Students" subtitle={`Course ${courseId}`} />
        <main className="mx-auto max-w-5xl flex-1 px-6 py-8">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Course roster</h2>
            <Button asChild variant="outline">
              <Link href={`/courses/${courseId}`}>Back to course</Link>
            </Button>
          </div>

          {membersQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading students...</p>
          ) : membersQuery.isError ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-destructive">
                Failed to load students.
              </CardContent>
            </Card>
          ) : membersQuery.data?.length ? (
            <div className="grid gap-4">
              {membersQuery.data.map((member) => (
                <Card key={member.id} className="border-none bg-card/90 shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{member.user?.name || member.user?.email || member.userId}</span>
                      <span className="text-xs text-muted-foreground">{member.role}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{member.user?.email || 'Email unavailable'}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No students found for this course.
              </CardContent>
            </Card>
          )}
        </main>
      </PageShell>
    </AuthGuard>
  );
}
