export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(path.includes('/source/check') ? 75000 : 30000),
  });
  const data = await response.json().catch(() => ({ error: 'The local server returned an unreadable response.' }));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}
export function send<T>(path: string, data: unknown, method = 'POST') {
  return api<T>(path, { method, body: JSON.stringify(data) });
}
