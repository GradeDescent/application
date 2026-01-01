'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthGuard } from '@/components/auth-guard';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch, ApiError } from '@/lib/apiClient';
import { useAuth } from '@/lib/auth';
import { useCourse, useCourseMembers } from '@/lib/queries';
import { PageShell } from '@/components/page-shell';

type RoleOption = 'STUDENT' | 'TA' | 'INSTRUCTOR';

export default function CourseStudentsPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = Array.isArray(params.courseId) ? params.courseId[0] : params.courseId;
  const membersQuery = useCourseMembers(courseId);
  const courseQuery = useCourse(courseId);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [roleOverrides, setRoleOverrides] = useState<Record<string, RoleOption>>({});
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  const memberRole = useMemo(
    () => membersQuery.data?.find((member) => member.userId === user?.id)?.role,
    [membersQuery.data, user?.id]
  );
  const viewerRole = courseQuery.data?.role ?? memberRole;
  const canManageRoles = viewerRole === 'OWNER' || viewerRole === 'INSTRUCTOR';

  const allowedTargets = useMemo(() => {
    if (viewerRole === 'OWNER') return ['STUDENT', 'TA', 'INSTRUCTOR'] satisfies RoleOption[];
    if (viewerRole === 'INSTRUCTOR') return ['TA'] satisfies RoleOption[];
    return [];
  }, [viewerRole]);

  const roleMutation = useMutation({
    mutationFn: async ({ memberId, nextRole }: { memberId: string; nextRole: RoleOption }) => {
      await apiFetch(`/memberships/${courseId}/members/${memberId}`, {
        method: 'PUT',
        body: JSON.stringify({ role: nextRole }),
      });
    },
    onSuccess: () => {
      setUpdateError(null);
      queryClient.invalidateQueries({ queryKey: ['course-members', courseId] });
      queryClient.invalidateQueries({ queryKey: ['course', courseId] });
    },
    onError: (err) => {
      setUpdateError(err instanceof ApiError ? err.message : 'Failed to update role.');
    },
  });

  return (
    <AuthGuard>
      <PageShell className="bg-[linear-gradient(120deg,_rgba(72,169,166,0.12),transparent_45%),linear-gradient(240deg,_rgba(66,129,164,0.1),transparent_45%)]">
        <SiteHeader
          title="Students"
          subtitle={`Course ${courseId}`}
          breadcrumbs={[
            { label: 'Courses', href: '/courses' },
            { label: courseQuery.data?.title || 'Course', href: `/courses/${courseId}` },
            { label: 'Students' },
          ]}
        />
        <main className="mx-auto max-w-5xl flex-1 px-6 py-8">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Course roster</h2>
            <Button asChild variant="outline">
              <Link href={`/courses/${courseId}`}>Back to course</Link>
            </Button>
          </div>
          {updateError ? <p className="mb-4 text-sm text-destructive">{updateError}</p> : null}

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
                      {canManageRoles &&
                      member.role !== 'OWNER' &&
                      member.userId !== user?.id &&
                      (viewerRole !== 'INSTRUCTOR' || member.role === 'STUDENT') ? (
                        <button
                          type="button"
                          className="rounded-full border border-border/70 px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:border-border hover:text-foreground"
                          onClick={() => setEditingMemberId(member.id)}
                        >
                          {member.role}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{member.role}</span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{member.user?.email || 'Email unavailable'}</p>
                        {editingMemberId === member.id ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Select a new role and save your changes.
                          </p>
                        ) : null}
                      </div>
                      {editingMemberId === member.id ? (
                        <div className="flex w-full max-w-xs flex-wrap items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-2">
                          <select
                            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                            value={roleOverrides[member.id] ?? member.role}
                            onChange={(event) =>
                              setRoleOverrides((prev) => ({
                                ...prev,
                                [member.id]: event.target.value as RoleOption,
                              }))
                            }
                            disabled={roleMutation.isPending}
                          >
                            {Array.from(new Set([member.role, ...allowedTargets])).map((role) => (
                              <option key={role} value={role} disabled={!allowedTargets.includes(role)}>
                                {role}
                              </option>
                            ))}
                          </select>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const nextRole = roleOverrides[member.id] ?? member.role;
                              if (nextRole === member.role) return;
                              roleMutation.mutate({ memberId: member.userId, nextRole });
                              setEditingMemberId(null);
                            }}
                            disabled={
                              roleMutation.isPending ||
                              !allowedTargets.includes(roleOverrides[member.id] ?? member.role)
                            }
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingMemberId(null);
                              setRoleOverrides((prev) => {
                                const next = { ...prev };
                                delete next[member.id];
                                return next;
                              });
                            }}
                            disabled={roleMutation.isPending}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : null}
                    </div>
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
