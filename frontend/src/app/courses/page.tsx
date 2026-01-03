'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SiteHeader } from '@/components/site-header';
import { apiFetch, ApiError } from '@/lib/apiClient';
import { useCourses } from '@/lib/queries';
import { PageShell } from '@/components/page-shell';

export default function CoursesPage() {
  const queryClient = useQueryClient();
  const coursesQuery = useCourses();
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      const data = await apiFetch<{ course: { id: string } }>('/courses', {
        method: 'POST',
        body: JSON.stringify({ title, code: code || undefined, description: description || undefined }),
      });
      return data.course;
    },
    onSuccess: () => {
      setTitle('');
      setCode('');
      setDescription('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to create course.');
      }
    },
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      await apiFetch<{ membership: { id: string } }>('/memberships/join', {
        method: 'POST',
        body: JSON.stringify({ courseCode: joinCode }),
      });
    },
    onSuccess: () => {
      setJoinCode('');
      setJoinError(null);
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
    onError: (err) => {
      setJoinError(err instanceof ApiError ? err.message : 'Failed to join course.');
    },
  });

  return (
    <AuthGuard>
      <PageShell className="bg-[linear-gradient(135deg,_rgba(66,129,164,0.12),transparent_40%),linear-gradient(225deg,_rgba(212,180,131,0.16),transparent_40%)]">
        <SiteHeader
          title="Courses"
          subtitle="Your teaching and learning spaces"
          breadcrumbs={[{ label: 'Courses', href: '/courses' }]}
        />

        <main className="mx-auto flex max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
          <div className="grid gap-4">
            {coursesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading courses...</p>
            ) : coursesQuery.isError ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-destructive">
                  Failed to load courses.
                </CardContent>
              </Card>
            ) : coursesQuery.data?.items.length ? (
              coursesQuery.data.items.map((course) => {
                const description = course.description?.trim()
                  ? course.description.trim()
                  : 'No description provided.';
                return (
                  <Link
                    key={course.id}
                    href={`/courses/${course.id}`}
                    className="group block transition-transform hover:-translate-y-0.5"
                  >
                    <Card className="border-none bg-card/90 shadow transition-colors group-hover:bg-card/100 group-hover:shadow-lg group-hover:ring-2 group-hover:ring-primary/30">
                      <CardHeader>
                        <CardTitle className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <span className="text-base font-semibold">{course.title}</span>
                          <span className="text-xs text-muted-foreground">{course.role || 'MEMBER'}</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-sm text-muted-foreground">{description}</p>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })
            ) : (
              <Card>
                <CardContent className="space-y-2 py-8 text-center text-sm text-muted-foreground">
                  <p>No courses yet.</p>
                  <p>Create a course or join one using a code from your instructor.</p>
                </CardContent>
              </Card>
            )}
          </div>

          <Card className="border-none bg-card/90 shadow-lg">
            <CardHeader>
              <CardTitle>Join a course</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">
                Your instructor may have provided you with a course code. Enter it here to join as a student.
              </p>
              <form
                className="flex flex-col gap-3 md:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  joinMutation.mutate();
                }}
              >
                <Input
                  placeholder="Course code"
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value)}
                  required
                />
                <Button type="submit" disabled={joinMutation.isPending || !joinCode.trim()}>
                  Join
                </Button>
              </form>
              {joinError ? <p className="mt-2 text-sm text-destructive">{joinError}</p> : null}
            </CardContent>
          </Card>

          <Card className="border-none bg-card/90 shadow-lg">
            <CardHeader>
              <CardTitle>Create a course</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  createMutation.mutate();
                }}
              >
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Title</label>
                    <Input
                      placeholder="Intro to Optimization"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Course code</label>
                    <Input
                      placeholder="OPT-402"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Leave blank to auto-generate a code.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</label>
                  <textarea
                    className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Share expectations, cadence, or policies for this course."
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    You will be added as the course owner.
                  </p>
                  <Button type="submit" disabled={createMutation.isPending || !title.trim()}>
                    Create course
                  </Button>
                </div>
              </form>
              {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
            </CardContent>
          </Card>
        </main>
      </PageShell>
    </AuthGuard>
  );
}
