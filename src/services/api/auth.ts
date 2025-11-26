import { request } from './http';
export type SignInPayload = { email: string; password: string };
export type SignInResponse = { token: string; userId: string };
export async function signIn(payload: SignInPayload) {
  return request<SignInResponse>('/auth/sign-in', { method: 'POST', body: JSON.stringify(payload) });
}
