let activeCompanyId: number | null = null;
let activeFyId: number | null = null;
let currentUser: string | null = null;

export function setWorkspace(companyId: number, fyId?: number): void {
  activeCompanyId = companyId;
  activeFyId = fyId ?? null;
}

export function getActiveCompanyId(): number | null {
  return activeCompanyId;
}

export function getActiveFyId(): number | null {
  return activeFyId;
}

export function setCurrentUser(username: string | null): void {
  currentUser = username;
}

export function getCurrentUser(): string | null {
  return currentUser;
}

export function clearSession(): void {
  activeCompanyId = null;
  activeFyId = null;
  currentUser = null;
}
