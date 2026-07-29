import { ApiResponse } from '../types';
import { Env } from '../types';
import { corsHeaders } from './cors';

/** Attach CORS headers to any response (used by the Worker entrypoint). */
export function attachCors(request: Request, env: Env, response: Response): Response {
  const headers = new Headers(response.headers);
  const cors = corsHeaders(request, env);
  for (const [k, v] of Object.entries(cors)) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Create a successful API response
 */
export function json<T>(data: T, status: number = 200, meta?: any): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create an error API response
 */
export function error(
  code: string,
  message: string,
  status: number = 400,
  details?: any
): Response {
  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Handle CORS preflight requests
 */
export function cors(request: Request, env: Env): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, env),
  });
}
