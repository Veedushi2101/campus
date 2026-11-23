import crypto from 'crypto';
import {env} from '../../config/env.ts';

export interface SignedSessionPayload {
  sub: string;
  iat: number;
  exp: number;
  mode: 'demo';
}

export function signSessionToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SignedSessionPayload = {
    sub: userId,
    iat: now,
    exp: now + 60 * 60 * 12,
    mode: 'demo',
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', env.sessionSecret)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SignedSessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expected = crypto
    .createHmac('sha256', env.sessionSecret)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedSessionPayload;
    if (!parsed.sub || typeof parsed.exp !== 'number') return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Generates an opaque, non-PII QR verification token.
 * Contains zero student name, email, or personal identifiers.
 */
export function generateOpaqueQrToken(): string {
  return `CV-QR-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}
