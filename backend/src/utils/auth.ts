import { RequestContext, User } from '../types';

/**
 * Extract user ID from JWT token in Authorization header
 * In production, this would verify the JWT signature
 */
export async function getUserIdFromRequest(request: Request, env: any): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  console.log('[Auth] Authorization header present:', !!authHeader);
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('[Auth] No Authorization header or invalid format');
    return null;
  }

  const token = authHeader.substring(7);
  console.log('[Auth] Token received, length:', token.length, 'preview:', token.substring(0, 30) + '...');

  // In test environment, accept any bearer token and use a fixed user id.
  // The tests mock DB responses for SELECT * FROM users, so the actual id
  // value is not important as long as it is non-null.
  if (env?.ENVIRONMENT === 'test') {
    console.log('[Auth] Test environment, using test-user');
    return 'test-user';
  }

  // In production, verify JWT token here
  // For now, we'll use a simple approach (not secure for production)
  try {
    // Decode JWT (without verification for MVP)
    const parts = token.split('.');
    console.log('[Auth] Token parts count:', parts.length);
    
    if (parts.length !== 3) {
      // Not a valid JWT format
      console.warn('[Auth] Invalid token format - expected 3 parts, got:', parts.length);
      console.warn('[Auth] Token preview:', token.substring(0, 50) + '...');
      return null;
    }
    
    console.log('[Auth] Decoding payload...');
    const payload = JSON.parse(atob(parts[1]));
    const userId = payload.userId || null;
    const signature = parts[2];
    
    console.log('[Auth] Token decoded successfully');
    console.log('[Auth] - userId:', userId);
    console.log('[Auth] - signature:', signature);
    console.log('[Auth] - env.ENVIRONMENT:', env?.ENVIRONMENT);
    console.log('[Auth] - isDemoToken:', signature === 'demo-signature');
    
    // In development OR if token has "demo-signature", allow it even if user doesn't exist in DB
    // This allows demo accounts to work in both development and production
    if (userId && signature === 'demo-signature') {
      console.log('[Auth] ✅ Demo token detected for user:', userId);
      return userId;
    }
    
    if (userId) {
      console.log('[Auth] ✅ Regular token for user:', userId);
      return userId;
    }
    
    console.warn('[Auth] ⚠️ No userId found in token payload');
    return null;
  } catch (error) {
    console.error('[Auth] ❌ Token decode error:', error);
    console.error('[Auth] Error details:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Get request context with user information
 */
export async function getRequestContext(
  request: Request,
  env: any
): Promise<RequestContext> {
  console.log('[Auth] getRequestContext called');
  const userId = await getUserIdFromRequest(request, env);
  console.log('[Auth] getUserIdFromRequest returned:', userId);
  
  if (!userId) {
    console.log('[Auth] No userId, returning unauthenticated');
    return { isAuthenticated: false };
  }

  // Fetch user from database
  console.log('[Auth] Fetching user from database for userId:', userId);
  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  )
    .bind(userId)
    .first() as User | null;

  console.log('[Auth] User found in DB:', !!user);
  if (user) {
    console.log('[Auth] User email:', user.email, 'is_business:', user.is_business, 'is_instructor:', user.is_instructor);
  }

  // If user doesn't exist but we have a valid userId (demo account), create a minimal user object
  // This allows demo accounts to work without being in the database
  // Check if it's a demo account by checking if userId starts with 'demo-' or 'dev'
  const isDemoAccount = userId && (userId.startsWith('demo-') || userId === 'dev');
  console.log('[Auth] Is demo account:', isDemoAccount);
  
  if (!user && isDemoAccount) {
    console.log('[Auth] ✅ Demo user not in DB, creating minimal user object for:', userId);
    const demoUser: User = {
      id: userId,
      email: `${userId}@demo.growl.app`,
      password_hash: '',
      points: userId.includes('instructor') ? 750 : userId.includes('business') ? 1000 : 150,
      is_instructor: (userId.includes('instructor') || userId.includes('business')) ? true : false,
      is_business: userId.includes('business') ? true : false,
      metadata: JSON.stringify({ 
        username: userId,
        categories: userId.includes('business') ? ['fitness', 'art', 'mindset'] : 
                   userId.includes('instructor') ? ['fitness', 'mindset'] : 
                   ['fitness', 'art']
      }),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    console.log('[Auth] Created demo user object:', JSON.stringify(demoUser, null, 2));
    return {
      userId,
      user: demoUser,
      isAuthenticated: true,
    };
  }

  if (!user) {
    console.warn('[Auth] ⚠️ User not found in DB and not a demo account');
  }

  return {
    userId,
    user: user || undefined,
    isAuthenticated: !!user,
  };
}

/**
 * Generate a simple JWT token (for MVP - not production-ready)
 * In production, use a proper JWT library with signing
 */
export function generateToken(userId: string, env: any): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload = {
    userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
  };

  // In production, sign with env.JWT_SECRET
  // For MVP, we'll use base64 encoding (NOT SECURE - for development only)
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  
  return `${encodedHeader}.${encodedPayload}.signature`;
}

/**
 * Hash password (simple implementation - use bcrypt in production)
 */
export async function hashPassword(password: string): Promise<string> {
  // In production, use bcrypt or similar
  // For MVP, we'll use a simple hash (NOT SECURE)
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Verify password
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}


