import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export function issueToken(payload, secret) {
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

export function verifyToken(token, secret) {
  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}

export async function verifyAdminCredentials(username, password, env) {
  const okUser = username === env.ADMIN_USER;
  const okPass = await bcrypt.compare(password, env.ADMIN_PASS_HASH || '');
  return okUser && okPass;
}
