'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch, ApiError } from '@/lib/apiClient';
import { useEvaluations, useLatestEvaluation, useSubmission, formatScore } from '@/lib/queries';

type UploadMode = 'TEX' | 'PDF';

type PresignResponse = {
  artifactId: string;
  upload: { url: string; method: 'PUT'; headers: Record<string, string>; expiresAt: string };
};

async function computeSha256(file: File) {
  if (!crypto?.subtle) throw new Error('SHA256 not supported in this browser');
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function SubmissionWidget({ assignmentId }: { assignmentId: string }) {
  const queryClient = useQueryClient();
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [primaryArtifactId, setPrimaryArtifactId] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<UploadMode>('TEX');
  const [texBody, setTexBody] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submissionQuery = useSubmission(submissionId || undefined);
  const evaluationsQuery = useEvaluations(submissionId || undefined);
  const latestEval = useLatestEvaluation(evaluationsQuery.data);
  const canEdit = submissionQuery.data?.status ? submissionQuery.data.status === 'UPLOADING' : true;

  const createSubmission = useMutation({
    mutationFn: async () => {
      const data = await apiFetch<{ submission: { id: string } }>(`/assignments/${assignmentId}/submissions`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      return data.submission;
    },
    onSuccess: (submission) => {
      setSubmissionId(submission.id);
      setPrimaryArtifactId(null);
      setTexBody('');
      setPdfFile(null);
      setUploadMode('TEX');
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Failed to start submission.');
    },
  });

  const uploadTex = useMutation({
    mutationFn: async () => {
      if (!submissionId) throw new Error('No submission');
      const data = await apiFetch<{ artifact: { id: string } }>(`/submissions/${submissionId}/artifacts/tex`, {
        method: 'POST',
        body: JSON.stringify({ texBody, contentType: 'text/plain' }),
      });
      return data.artifact;
    },
    onSuccess: (artifact) => {
      setPrimaryArtifactId(artifact.id);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'TeX upload failed.');
    },
  });

  const uploadPdf = useMutation({
    mutationFn: async () => {
      if (!submissionId) throw new Error('No submission');
      if (!pdfFile) throw new Error('No PDF selected');
      const presign = await apiFetch<PresignResponse>(`/submissions/${submissionId}/artifacts/pdf/presign`, {
        method: 'POST',
        body: JSON.stringify({ contentType: 'application/pdf', filename: pdfFile.name, sizeBytes: pdfFile.size }),
      });

      const uploadRes = await fetch(presign.upload.url, {
        method: presign.upload.method,
        headers: presign.upload.headers,
        body: pdfFile,
      });
      if (!uploadRes.ok) {
        throw new Error('PDF upload failed');
      }

      const sha256 = await computeSha256(pdfFile);
      const complete = await apiFetch<{ artifact: { id: string } }>(`/artifacts/${presign.artifactId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ sha256, sizeBytes: pdfFile.size }),
      });

      return complete.artifact;
    },
    onSuccess: (artifact) => {
      setPrimaryArtifactId(artifact.id);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'PDF upload failed.');
    },
  });

  const submitSubmission = useMutation({
    mutationFn: async () => {
      if (!submissionId || !primaryArtifactId) throw new Error('Missing artifact');
      const data = await apiFetch<{ submission: { id: string } }>(`/submissions/${submissionId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ primaryArtifactId }),
      });
      return data.submission;
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['submission', submissionId] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Submission failed.');
    },
  });

  const statusLabel = submissionQuery.data?.status || 'UPLOADING';
  const scoreLabel = formatScore(latestEval || undefined);

  const evaluationSummary = useMemo(() => {
    const result = latestEval?.result as any;
    if (!result) return null;
    return {
      summary: result.summary as string | undefined,
      items: Array.isArray(result.items) ? result.items : [],
    };
  }, [latestEval]);

  return (
    <Card className="border-none bg-card/90 shadow">
      <CardHeader>
        <CardTitle>Submit your work</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!submissionId ? (
          <Button onClick={() => createSubmission.mutate()} disabled={createSubmission.isPending}>
            Start submission
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Status:</span>
              <span className="rounded-full bg-muted px-2 py-1 text-xs">{statusLabel}</span>
            </div>
            {!canEdit ? (
              <p className="text-xs text-muted-foreground">Submission finalized. Start a new submission to change work.</p>
            ) : null}

            <div className="flex gap-2">
              <Button
                type="button"
                variant={uploadMode === 'TEX' ? 'default' : 'outline'}
                onClick={() => setUploadMode('TEX')}
              >
                Upload TeX
              </Button>
              <Button
                type="button"
                variant={uploadMode === 'PDF' ? 'default' : 'outline'}
                onClick={() => setUploadMode('PDF')}
              >
                Upload PDF
              </Button>
            </div>

            {uploadMode === 'TEX' ? (
              <div className="space-y-2">
                <textarea
                  className="min-h-[160px] w-full rounded-md border border-input bg-background p-3 text-sm"
                  placeholder="Paste LaTeX here..."
                  value={texBody}
                  onChange={(event) => setTexBody(event.target.value)}
                />
                <Button onClick={() => uploadTex.mutate()} disabled={!canEdit || uploadTex.isPending || !texBody.trim()}>
                  Upload TeX
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => setPdfFile(event.target.files?.[0] || null)}
                />
                <Button onClick={() => uploadPdf.mutate()} disabled={!canEdit || uploadPdf.isPending || !pdfFile}>
                  Upload PDF
                </Button>
                <p className="text-xs text-muted-foreground">
                  PDF uploads are finalized after calculating a client-side SHA256.
                </p>
              </div>
            )}

            <Button
              onClick={() => submitSubmission.mutate()}
              disabled={!canEdit || submitSubmission.isPending || !primaryArtifactId}
            >
              Submit
            </Button>
          </div>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {submissionId ? (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Latest evaluation</h4>
            {evaluationsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading evaluation...</p>
            ) : latestEval ? (
              <div className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>{latestEval.status}</span>
                  {scoreLabel ? <span className="font-medium">{scoreLabel}</span> : null}
                </div>
                {evaluationSummary?.summary ? <p className="mt-2">{evaluationSummary.summary}</p> : null}
                {evaluationSummary?.items?.length ? (
                  <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
                    {evaluationSummary.items.map((item: any, idx: number) => (
                      <li key={`${item.message}-${idx}`}>{item.message || 'Issue'}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No evaluations yet.</p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
