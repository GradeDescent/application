import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DEFAULT_EXPIRES_SECONDS = 15 * 60;
const PDF_PREFIX = 'v1/submission/';

const isTestEnv = process.env.NODE_ENV === 'test';

function getArtifactsBucket() {
  const bucket = process.env.ARTIFACTS_BUCKET;
  if (bucket) return bucket;
  if (isTestEnv) return 'test-bucket';
  throw new Error('ARTIFACTS_BUCKET is not set');
}

function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
  });
}

function sanitizeFilename(name?: string) {
  if (!name) return 'submission.pdf';
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
  return cleaned.length ? cleaned : 'submission.pdf';
}

export function buildSubmissionPdfKey(submissionId: string, filename?: string) {
  const safeName = sanitizeFilename(filename);
  const suffix = safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`;
  return `${PDF_PREFIX}${submissionId}/${Date.now()}-${suffix}`;
}

export async function getPresignedUploadUrl(params: {
  key: string;
  contentType: string;
  contentLength?: number;
  expiresInSeconds?: number;
}) {
  const bucket = getArtifactsBucket();
  const expiresIn = params.expiresInSeconds ?? DEFAULT_EXPIRES_SECONDS;

  if (isTestEnv) {
    return {
      bucket,
      url: `https://example.invalid/${encodeURIComponent(params.key)}`,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: params.key,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
  });
  const url = await getSignedUrl(client, command, { expiresIn });
  return { bucket, url, expiresAt: new Date(Date.now() + expiresIn * 1000) };
}

export async function getPresignedDownloadUrl(params: { key: string; expiresInSeconds?: number }) {
  const bucket = getArtifactsBucket();
  const expiresIn = params.expiresInSeconds ?? DEFAULT_EXPIRES_SECONDS;

  if (isTestEnv) {
    return {
      bucket,
      url: `https://example.invalid/${encodeURIComponent(params.key)}`,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: params.key,
  });
  const url = await getSignedUrl(client, command, { expiresIn });
  return { bucket, url, expiresAt: new Date(Date.now() + expiresIn * 1000) };
}
