'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { SiteHeader } from '@/components/site-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAssignments } from '@/lib/queries';

export default function AssignmentsPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = Array.isArray(params.courseId) ? params.courseId[0] : params.courseId;
  const assignmentsQuery = useAssignments(courseId);
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [totalPoints, setTotalPoints] = useState('10');
  const [sourceTex, setSourceTex] = useState('');
  const [texFilename, setTexFilename] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      const data = await apiFetch<{ assignment: { id: string } }>(`/courses/${courseId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          totalPoints: Number(totalPoints),
          sourceTex,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        }),
      });
      return data.assignment;
    },
    onSuccess: () => {
      setTitle('');
      setTotalPoints('10');
      setSourceTex('');
      setTexFilename('');
      setDueAt('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['assignments', courseId] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Failed to create assignment.');
    },
  });

  const publishMutation = useMutation({
    mutationFn: async ({ assignmentId, action }: { assignmentId: string; action: 'publish' | 'unpublish' }) => {
      const data = await apiFetch<{ assignment: { id: string } }>(
        `/courses/${courseId}/assignments/${assignmentId}/${action}`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      return data.assignment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', courseId] });
    },
  });

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[linear-gradient(120deg,_rgba(72,169,166,0.12),transparent_45%),linear-gradient(240deg,_rgba(66,129,164,0.1),transparent_45%)]">
        <SiteHeader title="Assignments" subtitle={`Course ${courseId}`} />
        <main className="mx-auto max-w-5xl px-6 py-8">
          <Card className="mb-6 border-none bg-card/90 shadow">
            <CardHeader>
              <CardTitle>Create assignment</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  createMutation.mutate();
                }}
              >
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Title</label>
                  <Input
                    placeholder="Assignment title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total points</label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="Total points"
                      value={totalPoints}
                      onChange={(event) => setTotalPoints(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Due date (optional)</label>
                    <Input
                      type="datetime-local"
                      value={dueAt}
                      onChange={(event) => setDueAt(event.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">LaTeX source file</label>
                  <Input
                    type="file"
                    accept=".tex,text/plain"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      setTexFilename(file.name);
                      const reader = new FileReader();
                      reader.onload = () => setSourceTex(String(reader.result || ''));
                      reader.readAsText(file);
                    }}
                  />
                  {texFilename ? (
                    <p className="text-xs text-muted-foreground">Selected: {texFilename}</p>
                  ) : null}
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button
                  type="submit"
                  disabled={createMutation.isPending || !title.trim() || !sourceTex.trim()}
                >
                  Create assignment
                </Button>
              </form>
            </CardContent>
          </Card>
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
                  <CardContent className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">Total points: {assignment.totalPoints}</p>
                    <div className="flex flex-wrap gap-2">
                      {assignment.status === 'DRAFT' ? (
                        <Button
                          variant="secondary"
                          onClick={() => publishMutation.mutate({ assignmentId: assignment.id, action: 'publish' })}
                          disabled={publishMutation.isPending}
                        >
                          Publish
                        </Button>
                      ) : null}
                      {assignment.status === 'PUBLISHED' ? (
                        <Button
                          variant="outline"
                          onClick={() => publishMutation.mutate({ assignmentId: assignment.id, action: 'unpublish' })}
                          disabled={publishMutation.isPending}
                        >
                          Unpublish
                        </Button>
                      ) : null}
                      <Button asChild>
                        <Link href={`/courses/${courseId}/assignments/${assignment.id}`}>Open</Link>
                      </Button>
                    </div>
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
