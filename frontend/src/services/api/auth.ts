import { request } from './http';
import { sha256Hex } from '../../utils/cryptoHash';

export type SessionResponse = {
  token: string;
  userId: string;
  email?: string;
  isInstructor: boolean;
  isBusiness?: boolean;
  hasCompletedOnboarding: boolean;
  categories?: string[];
};

export type SignUpResponse = {
  requiresEmailVerification: true;
  email: string;
  message: string;
  devVerificationCode?: string;
};

export async function signUpApi(payload: {
  email: string;
  password: string;
  username?: string;
}): Promise<SignUpResponse> {
  const passwordHash = await sha256Hex(payload.password);
  const res = await request<{ success: boolean; data: SignUpResponse }>('/auth/sign-up', {
    method: 'POST',
    body: JSON.stringify({
      email: payload.email,
      username: payload.username,
      passwordHash,
    }),
  });
  return res.data;
}

export async function verifyEmailApi(email: string, code: string): Promise<void> {
  await request('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
}

export async function signInApi(email: string, password: string): Promise<SessionResponse> {
  const passwordHash = await sha256Hex(password);
  const res = await request<{ success: boolean; data: SessionResponse }>('/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({ email, password, passwordHash }),
  });
  return res.data;
}

export async function signInSsoApi(payload: {
  provider: 'google' | 'facebook';
  idToken?: string;
  accessToken?: string;
}): Promise<SessionResponse> {
  const res = await request<{ success: boolean; data: SessionResponse }>('/auth/sso', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}
