import bcrypt from 'bcryptjs';
import { queryOne, executeWrite } from './database';
import { setCurrentUser, clearSession } from './session';

const MAX_ATTEMPTS = 5;

export async function login(
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const user = queryOne<{
    id: number;
    password_hash: string;
    failed_attempts: number;
    locked_until: string | null;
  }>('SELECT * FROM users WHERE username = ?', [username]);

  if (!user) return { success: false, error: 'Invalid username or password' };

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return { success: false, error: 'Account locked. Try again later.' };
  }

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) {
    const attempts = user.failed_attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      executeWrite('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?', [
        attempts,
        lockUntil,
        user.id
      ]);
      return { success: false, error: 'Too many attempts. Locked for 5 minutes.' };
    }
    executeWrite('UPDATE users SET failed_attempts = ? WHERE id = ?', [attempts, user.id]);
    return { success: false, error: 'Invalid username or password' };
  }

  executeWrite('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
  setCurrentUser(username);
  return { success: true };
}

export function logout(): void {
  clearSession();
}

export function changePassword(
  username: string,
  currentPassword: string,
  newPassword: string
): { success: boolean; error?: string } {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'New password must be at least 6 characters' };
  }

  const user = queryOne<{ id: number; password_hash: string }>(
    'SELECT id, password_hash FROM users WHERE username = ?',
    [username]
  );

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return { success: false, error: 'Current password is incorrect' };
  }

  if (bcrypt.compareSync(newPassword, user.password_hash)) {
    return { success: false, error: 'New password must be different from current password' };
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  executeWrite('UPDATE users SET password_hash = ?, password_hint = NULL WHERE id = ?', [
    hash,
    user.id
  ]);

  return { success: true };
}
