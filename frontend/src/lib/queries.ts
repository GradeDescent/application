import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './apiClient';
import {
  assignmentSchema,
  courseMemberSchema,
  courseSchema,
  evaluationSchema,
  submissionSchema,
  type Assignment,
  type Course,
  type Evaluation,
  type Submission,
} from './schemas';

const listResponse = <T>(schema: { parse: (val: unknown) => T }) => {
  return (data: { items?: unknown[]; next_cursor?: string | null }) => ({
    items: (data.items || []).map((item) => schema.parse(item)),
    nextCursor: data.next_cursor ?? null,
  });
};

export function useCourses() {
  return useQuery({
    queryKey: ['courses'],
    queryFn: async () => {
      const data = await apiFetch<{ items: Course[]; next_cursor?: string | null }>('/courses');
      return listResponse(courseSchema)(data);
    },
  });
}

export function useCourse(courseId?: string) {
  return useQuery({
    queryKey: ['course', courseId],
    queryFn: async () => {
      const data = await apiFetch<{ course: Course }>(`/courses/${courseId}`);
      return courseSchema.parse(data.course);
    },
    enabled: !!courseId,
  });
}

export function useCourseMembers(courseId?: string) {
  return useQuery({
    queryKey: ['course-members', courseId],
    queryFn: async () => {
      const data = await apiFetch<{ items: unknown[] }>(`/memberships/${courseId}/members`);
      return data.items.map((item) => courseMemberSchema.parse(item));
    },
    enabled: !!courseId,
  });
}

export function useAssignments(courseId?: string) {
  return useQuery({
    queryKey: ['assignments', courseId],
    queryFn: async () => {
      const data = await apiFetch<{ items: Assignment[]; next_cursor?: string | null }>(`/courses/${courseId}/assignments`);
      return listResponse(assignmentSchema)(data);
    },
    enabled: !!courseId,
  });
}

export function useAssignment(courseId?: string, assignmentId?: string) {
  return useQuery({
    queryKey: ['assignment', courseId, assignmentId],
    queryFn: async () => {
      const data = await apiFetch<{ assignment: Assignment }>(`/courses/${courseId}/assignments/${assignmentId}`);
      return assignmentSchema.parse(data.assignment);
    },
    enabled: !!courseId && !!assignmentId,
  });
}

export function useSubmission(submissionId?: string) {
  const pollStart = useRef<number | null>(null);
  const query = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: async () => {
      const data = await apiFetch<{ submission: Submission }>(`/submissions/${submissionId}`);
      return submissionSchema.parse(data.submission);
    },
    enabled: !!submissionId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'SUBMITTED' || status === 'PROCESSING') {
        const startedAt = pollStart.current ?? Date.now();
        const elapsed = Date.now() - startedAt;
        return elapsed > 30_000 ? 5000 : 2000;
      }
      return false;
    },
  });

  useEffect(() => {
    if (query.data?.status === 'SUBMITTED' || query.data?.status === 'PROCESSING') {
      if (!pollStart.current) pollStart.current = Date.now();
    } else {
      pollStart.current = null;
    }
  }, [query.data?.status]);

  return query;
}

export function useSubmissions(assignmentId?: string) {
  return useQuery({
    queryKey: ['submissions', assignmentId],
    queryFn: async () => {
      const data = await apiFetch<{ items: Submission[]; next_cursor?: string | null }>(
        `/assignments/${assignmentId}/submissions`,
      );
      return listResponse(submissionSchema)(data);
    },
    enabled: !!assignmentId,
  });
}

export function useEvaluations(submissionId?: string) {
  const pollStart = useRef<number | null>(null);
  const query = useQuery({
    queryKey: ['evaluations', submissionId],
    queryFn: async () => {
      const data = await apiFetch<{ items: Evaluation[] }>(`/submissions/${submissionId}/evaluations`);
      return data.items.map((item) => evaluationSchema.parse(item));
    },
    enabled: !!submissionId,
    refetchInterval: (query) => {
      const latest = query.state.data?.[query.state.data.length - 1];
      if (latest && (latest.status === 'QUEUED' || latest.status === 'RUNNING')) {
        const startedAt = pollStart.current ?? Date.now();
        const elapsed = Date.now() - startedAt;
        return elapsed > 30_000 ? 5000 : 2000;
      }
      return false;
    },
  });

  useEffect(() => {
    const latest = query.data?.[query.data.length - 1];
    if (latest && (latest.status === 'QUEUED' || latest.status === 'RUNNING')) {
      if (!pollStart.current) pollStart.current = Date.now();
    } else {
      pollStart.current = null;
    }
  }, [query.data]);

  return query;
}

export function formatScore(evaluation?: Evaluation) {
  if (!evaluation) return null;
  if (evaluation.scorePoints != null && evaluation.scoreOutOf != null) {
    return `${evaluation.scorePoints} / ${evaluation.scoreOutOf}`;
  }
  return null;
}

export function useLatestEvaluation(evaluations: Evaluation[] | undefined) {
  return useMemo(() => {
    if (!evaluations || evaluations.length === 0) return null;
    return evaluations[evaluations.length - 1];
  }, [evaluations]);
}
