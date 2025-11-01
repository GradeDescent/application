import bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export async function hashPassword(password: string) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function sha256(input: string) {
  return createHash('sha256').update(input).digest('hex');
}

export function newServiceToken(): { token: string; hash: string } {
  const raw = 'st.' + randomBytes(28).toString('base64url');
  const hash = sha256(raw);
  return { token: raw, hash };
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

