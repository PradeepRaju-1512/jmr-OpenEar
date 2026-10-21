import { User } from '../types';

/**
 * Session handling for the Django API.
 *
 * - The only credential the browser ever holds is the opaque bearer token issued by Django
 *   AFTER it cryptographically verified a Google ID token. It lives in sessionStorage (cleared
 *   when the tab closes).
 * - The user object is NEVER cached or trusted client-side: it is always re-read from the server.
 */

const TOKEN_KEY = 'openear_session_token';
export const UNAUTHORIZED_EVENT = 'openear:unauthorized';

export function getSessionToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setSessionToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable: the session simply will not survive a reload */
  }
}

export function clearSessionToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Kept for components that still build headers by hand. Prefer apiFetch(). */
export function getAuthHeaders(_user?: User | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getSessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** fetch() that attaches the bearer token and signs the user out on any 401. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getSessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401 && token) {
    clearSessionToken();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  return res;
}

export async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string' && data.error) return data.error;
  } catch {
    /* non-JSON error body */
  }
  return `${fallback} (HTTP ${res.status})`;
}

/** Exchanges a Google ID token (from Google Identity Services) for an OpenEar session. */
export async function signInWithGoogleCredential(credential: string): Promise<User> {
  const res = await fetch('/api/v1/auth/google-verify/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'Sign-in failed'));
  }
  const data = await res.json();
  if (!data?.token || !data?.user) {
    throw new Error('Unexpected response from the server.');
  }
  setSessionToken(data.token);
  return data.user as User;
}

export type SessionCheck =
  | { status: 'ok'; user: User }
  | { status: 'signed-out' }
  | { status: 'unreachable' };

/** Asks the server who the current token belongs to. */
export async function fetchCurrentUser(): Promise<SessionCheck> {
  if (!getSessionToken()) return { status: 'signed-out' };
  try {
    const res = await apiFetch('/api/v1/auth/me/');
    if (res.status === 401) return { status: 'signed-out' };
    if (!res.ok) return { status: 'unreachable' };
    return { status: 'ok', user: (await res.json()) as User };
  } catch {
    return { status: 'unreachable' };
  }
}

export async function submitGender(gender: 'M' | 'F' | 'O'): Promise<User> {
  const res = await apiFetch('/api/v1/auth/profile/', {
    method: 'POST',
    body: JSON.stringify({ gender }),
  });
  if (!res.ok) throw new Error(await readApiError(res, 'Could not save your profile'));
  return (await res.json()) as User;
}

export async function logoutUser(): Promise<void> {
  try {
    await apiFetch('/api/v1/auth/logout/', { method: 'POST' });
  } catch {
    /* best effort: the local token is cleared regardless */
  }
  clearSessionToken();
}

/** Fetches a private evidence image with the bearer token and returns a temporary object URL. */
export async function fetchEvidenceBlobUrl(complaintId: string, attachmentId: string): Promise<string> {
  const res = await apiFetch(`/api/v1/complaints/${complaintId}/attachments/${attachmentId}/`);
  if (!res.ok) throw new Error(await readApiError(res, 'Could not load the image'));
  return URL.createObjectURL(await res.blob());
}
