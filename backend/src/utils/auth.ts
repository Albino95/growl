import { RequestContext, User } from '../types';
import { verifyAccessToken } from './jwt';

export async function getUserIdFromRequest(request: Request, env: any): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  if (env?.ENVIRONMENT === 'test') {
    return 'test-user';
  }

  const verified = await verifyAccessToken(token, env);
  return verified?.userId ?? null;
}

export async function getRequestContext(request: Request, env: any): Promise<RequestContext> {
  const userId = await getUserIdFromRequest(request, env);

  if (!userId) {
    return { isAuthenticated: false };
  }

  const user = (await env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first()) as User | null;

  if (!user) {
    return { isAuthenticated: false };
  }

  return {
    userId,
    user,
    isAuthenticated: true,
  };
}

export function userAuthPayload(user: User) {
  const metadata = JSON.parse(user.metadata || '{}');
  const categories = Array.isArray(metadata.categories) ? metadata.categories : [];
  return {
    userId: user.id,
    email: user.email,
    isInstructor: !!user.is_instructor,
    isBusiness: !!user.is_business,
    hasCompletedOnboarding: categories.length > 0,
    categories,
    emailVerified: !!(user as User & { email_verified?: number }).email_verified,
  };
}
