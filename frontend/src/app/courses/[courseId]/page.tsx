'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthGuard } from '@/components/auth-guard';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch, ApiError } from '@/lib/apiClient';
import { useAuth } from '@/lib/auth';
import { useCourse } from '@/lib/queries';
import { PageShell } from '@/components/page-shell';

export default function CourseDetailPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = Array.isArray(params.courseId) ? params.courseId[0] : params.courseId;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const courseQuery = useCourse(courseId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (courseQuery.data) {
      setTitle(courseQuery.data.title);
      setDescription(courseQuery.data.description || '');
    }
  }, [courseQuery.data]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const data = await apiFetch<{ course: { id: string } }>(`/courses/${courseId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, description: description || null }),
      });
      return data.course;
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['course', courseId] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Failed to update course.');
    },
  });

  const isOwner = Boolean(user && courseQuery.data && courseQuery.data.createdById === user.id);

  return (
    <AuthGuard>
      <PageShell className="bg-[linear-gradient(120deg,_rgba(72,169,166,0.12),transparent_45%),linear-gradient(240deg,_rgba(66,129,164,0.1),transparent_45%)]">
        <SiteHeader
          title="Course"
          subtitle={`Course ${courseId}`}
          breadcrumbs={[
            { label: 'Courses', href: '/courses' },
            { label: courseQuery.data?.title || 'Course' },
          ]}
        />
        <main className="mx-auto max-w-5xl flex-1 px-6 py-8 space-y-6">
          <Card className="border-none bg-card/90 shadow">
            <CardHeader className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <CardTitle>{courseQuery.data?.title || 'Course'}</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <Link href={`/courses/${courseId}/assignments`}>View assignments</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/courses/${courseId}/students`}>View students</Link>
                  </Button>
                  {isOwner ? (
                    <Button asChild variant="outline">
                      <Link href={`/courses/${courseId}/billing`}>View billing</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Code: {courseQuery.data?.code || '—'}</p>
            </CardHeader>
            <CardContent>
              {courseQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading course...</p>
              ) : courseQuery.isError ? (
                <p className="text-sm text-destructive">Failed to load course.</p>
              ) : (
                <p className="text-sm text-muted-foreground">{courseQuery.data?.description || 'No description yet.'}</p>
              )}
            </CardContent>
          </Card>

          {isOwner ? (
            <Card className="border-none bg-card/90 shadow">
              <CardHeader>
                <CardTitle>Edit course</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Title</label>
                  <input
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <textarea
                    className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !title.trim()}>
                  Save changes
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-none bg-card/90 shadow">
              <CardContent className="py-6 text-sm text-muted-foreground">
                Only course owners can edit the title or description.
              </CardContent>
            </Card>
          )}
        </main>
      </PageShell>
    </AuthGuard>
  );
}
