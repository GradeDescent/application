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
      <div className="min-h-screen bg-[linear-gradient(135deg,_rgba(66,129,164,0.12),transparent_40%),linear-gradient(225deg,_rgba(212,180,131,0.16),transparent_40%)]">
        <SiteHeader title="Courses" subtitle="Your teaching and learning spaces" />

        <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
          <Card className="border-none bg-card/90 shadow-lg">
            <CardHeader>
              <CardTitle>Create a course</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-3 md:grid-cols-[1fr_200px_1fr_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  createMutation.mutate();
                }}
              >
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Title</label>
                  <Input
                    placeholder="Course title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Course code</label>
                  <Input
                    placeholder="Code (optional)"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</label>
                  <textarea
                    className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Description (optional)"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
                <Button type="submit" disabled={createMutation.isPending || !title.trim()}>
                  Create
                </Button>
              </form>
              {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
            </CardContent>
          </Card>

          <Card className="border-none bg-card/90 shadow-lg">
            <CardHeader>
              <CardTitle>Join a course</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">
                Your instructor should have provided a course code. Enter it here to join as a student.
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
              coursesQuery.data.items.map((course) => (
                <Card key={course.id} className="border-none bg-card/90 shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{course.title}</span>
                      <span className="text-xs text-muted-foreground">{course.role || 'MEMBER'}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{course.code || 'No code'}</p>
                    <Button asChild variant="outline">
                      <Link href={`/courses/${course.id}/assignments`}>Assignments</Link>
                    </Button>
                    <Button asChild variant="ghost">
                      <Link href={`/courses/${course.id}`}>Details</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No courses yet. Create one to get started.
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
