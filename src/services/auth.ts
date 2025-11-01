import { prisma } from './prisma.js';
import { randomBytes } from 'crypto';
import { addMinutes, nowIso } from '../utils/time.js';
import { sendEmail } from './email.js';

export async function createMagicToken(email: string) {
  const user = await prisma.user.upsert({
    where: { email },
    create: { email },
    update: {},
  });
  const token = `ml.${randomBytes(24).toString('hex')}`;
  const ttlMin = Number(process.env.MAGIC_LINK_TTL_MINUTES || 15);
  await prisma.magicLinkToken.create({
    data: {
      userId: user.id,
      email,
      token,
      expiresAt: addMinutes(new Date(), ttlMin),
    },
  });
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const link = `${appUrl}/auth/magic?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: 'Your GradeDescent magic sign-in link',
    text: `Sign in by clicking: ${link}\nThis link expires in ${ttlMin} minutes.`,
  });
  return { token, userId: user.id, expiresAt: nowIso() };
}

export async function consumeMagicToken(token: string) {
  const row = await prisma.magicLinkToken.findUnique({ where: { token } });
  if (!row || row.consumedAt) throw Object.assign(new Error('Invalid token'), { status: 400, type: 'validation_error' });
  if (row.expiresAt < new Date()) throw Object.assign(new Error('Token expired'), { status: 400, type: 'validation_error' });
  await prisma.magicLinkToken.update({ where: { token }, data: { consumedAt: new Date() } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: row.userId! } });
  return user;
}

