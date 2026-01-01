export type ApiErrorPayload = {
  error: {
    type: string;
    message: string;
    fields?: Record<string, string>;
  };
};

export class ApiError extends Error {
  status: number;
  type: string;
  fields?: Record<string, string>;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.error.message || 'Request failed');
    this.status = status;
    this.type = payload.error.type || 'error';
    this.fields = payload.error.fields;
  }
}

const TOKEN_KEY = 'gd.jwt';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await res.json() : null;

  if (!res.ok) {
    const payload = (body || { error: { type: 'error', message: 'Request failed' } }) as ApiErrorPayload;
    throw new ApiError(res.status, payload);
  }

  return body as T;
}
