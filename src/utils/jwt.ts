import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

type Claims = { id: string; email: string };

export async function signUserJwt(user: Claims) {
  const token = jwt.sign({ email: user.email }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '7d',
    subject: user.id,
    audience: 'gradedescent:user',
    issuer: 'gradedescent',
  });
  return token;
}

export async function verifyUserJwt(token: string): Promise<jwt.JwtPayload | null> {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], audience: 'gradedescent:user', issuer: 'gradedescent' });
    return payload as jwt.JwtPayload;
  } catch {
    return null;
  }
}

