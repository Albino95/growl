import Constants from 'expo-constants';
const BASE_URL: string = (Constants?.expoConfig?.extra?.API_BASE_URL as string) || 'https://api.example.com';
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}
