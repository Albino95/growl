import { Env } from './types';
import { cors, error, json } from './utils/response';
import * as authRoutes from './routes/auth';
import * as feedRoutes from './routes/feed';
import * as commentRoutes from './routes/comments';
import * as marketplaceRoutes from './routes/marketplace';
import * as instructorRoutes from './routes/instructor';
import * as businessRoutes from './routes/business';
import * as profileRoutes from './routes/profile';

/**
 * Main request handler
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return cors();
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // API version prefix
    const apiPrefix = `/api/${env.API_VERSION || 'v1'}`;

    // Route handling
    try {
      // Auth routes
      if (path === `${apiPrefix}/auth/sign-up` && request.method === 'POST') {
        return authRoutes.signUp(request, env);
      }
      if (path === `${apiPrefix}/auth/sign-in` && request.method === 'POST') {
        return authRoutes.signIn(request, env);
      }
      if (path === `${apiPrefix}/auth/sign-out` && request.method === 'POST') {
        return authRoutes.signOut(request, env);
      }
      if (path === `${apiPrefix}/auth/refresh` && request.method === 'POST') {
        return authRoutes.refresh(request, env);
      }

      // Feed routes
      if (path === `${apiPrefix}/feed/feed` && request.method === 'GET') {
        return feedRoutes.getFeed(request, env);
      }
      if (path === `${apiPrefix}/feed/posts` && request.method === 'POST') {
        return feedRoutes.createPost(request, env);
      }

      // Get user posts (check before generic post routes)
      const userPostsMatch = path.match(new RegExp(`^${apiPrefix}/feed/posts/user/([^/]+)$`));
      if (userPostsMatch) {
        const userId = userPostsMatch[1];
        console.log('[index.ts] Matched user posts route for userId:', userId);
        if (request.method === 'GET') {
          return feedRoutes.getUserPosts(request, env, userId);
        }
      }

      // Like/unlike post (check before generic post routes)
      const likeMatch = path.match(new RegExp(`^${apiPrefix}/feed/posts/([^/]+)/like$`));
      if (likeMatch) {
        const postId = likeMatch[1];
        if (request.method === 'POST') {
          return feedRoutes.toggleLike(request, env, postId);
        }
      }

      // Comments routes
      const commentDeleteMatch = path.match(new RegExp(`^${apiPrefix}/feed/posts/([^/]+)/comments/([^/]+)$`));
      if (commentDeleteMatch) {
        const postId = commentDeleteMatch[1];
        const commentId = commentDeleteMatch[2];
        if (request.method === 'DELETE') {
          return commentRoutes.deleteComment(request, env, postId, commentId);
        }
      }

      const commentMatch = path.match(new RegExp(`^${apiPrefix}/feed/posts/([^/]+)/comments$`));
      if (commentMatch) {
        const postId = commentMatch[1];
        if (request.method === 'GET') {
          return commentRoutes.getComments(request, env, postId);
        }
        if (request.method === 'POST') {
          return commentRoutes.createComment(request, env, postId);
        }
      }

      // Dynamic routes for posts (check last)
      const postMatch = path.match(new RegExp(`^${apiPrefix}/feed/posts/([^/]+)$`));
      if (postMatch) {
        const postId = postMatch[1];
        if (request.method === 'GET') {
          return feedRoutes.getPost(request, env, postId);
        }
      }

      // Marketplace routes
      const productMatch = path.match(new RegExp(`^${apiPrefix}/marketplace/products/([^/]+)$`));
      if (productMatch) {
        const productId = productMatch[1];
        if (request.method === 'GET') {
          return marketplaceRoutes.getProduct(request, env, productId);
        }
      }

      if (path === `${apiPrefix}/marketplace/products` && request.method === 'GET') {
        return marketplaceRoutes.getProducts(request, env);
      }
      if (path === `${apiPrefix}/marketplace/products` && request.method === 'POST') {
        return marketplaceRoutes.createProduct(request, env);
      }
      if (path === `${apiPrefix}/marketplace/orders` && request.method === 'GET') {
        return marketplaceRoutes.getOrders(request, env);
      }
      if (path === `${apiPrefix}/marketplace/orders` && request.method === 'POST') {
        return marketplaceRoutes.createOrder(request, env);
      }

      // Instructor routes
      const instructorStudentsMatch = path.match(new RegExp(`^${apiPrefix}/instructor/instructors/([^/]+)/students$`));
      if (instructorStudentsMatch) {
        const instructorId = instructorStudentsMatch[1];
        if (request.method === 'GET') {
          return instructorRoutes.getInstructorStudents(request, env, instructorId);
        }
      }

      const instructorVoteMatch = path.match(new RegExp(`^${apiPrefix}/instructor/instructors/([^/]+)/vote$`));
      if (instructorVoteMatch) {
        const instructorId = instructorVoteMatch[1];
        if (request.method === 'POST') {
          return instructorRoutes.voteInstructor(request, env, instructorId);
        }
      }

      const instructorMatch = path.match(new RegExp(`^${apiPrefix}/instructor/instructors/([^/]+)$`));
      if (instructorMatch) {
        const instructorId = instructorMatch[1];
        if (request.method === 'GET') {
          return instructorRoutes.getInstructor(request, env, instructorId);
        }
      }

      if (path === `${apiPrefix}/instructor/instructors` && request.method === 'GET') {
        return instructorRoutes.getInstructors(request, env);
      }

      // Business routes
      if (path === `${apiPrefix}/business/dashboard` && request.method === 'GET') {
        return businessRoutes.getDashboard(request, env);
      }
      if (path === `${apiPrefix}/business/products` && request.method === 'GET') {
        return businessRoutes.getBusinessProducts(request, env);
      }
      if (path === `${apiPrefix}/business/orders` && request.method === 'GET') {
        return businessRoutes.getBusinessOrders(request, env);
      }
      if (path === `${apiPrefix}/business/partnerships` && request.method === 'GET') {
        return businessRoutes.getPartnerships(request, env);
      }

      // Profile routes
      if (path === `${apiPrefix}/profile` && request.method === 'GET') {
        return profileRoutes.getProfile(request, env);
      }
      if (path === `${apiPrefix}/profile` && request.method === 'PUT') {
        return profileRoutes.updateProfile(request, env);
      }

      // Health check / ping endpoint
      if (path === `${apiPrefix}/health` && request.method === 'GET') {
        let dbStatus = 'not configured';
        let kvStatus = 'not configured';
        
        // Test database connection
        if (env.DB) {
          try {
            await env.DB.prepare('SELECT 1').first();
            dbStatus = 'connected';
          } catch (err) {
            dbStatus = 'error';
            console.error('[health] Database connection error:', err);
          }
        }

        // Test KV connection
        if (env.KV) {
          try {
            await env.KV.get('health-check');
            kvStatus = 'connected';
          } catch (err) {
            kvStatus = 'error';
            console.error('[health] KV connection error:', err);
          }
        }

        return json({
          status: 'ok',
          timestamp: new Date().toISOString(),
          environment: env.ENVIRONMENT,
          database: dbStatus,
          kv: kvStatus,
        });
      }

      // 404 for unmatched routes
      return error('NOT_FOUND', `Route not found: ${path}`, 404);
    } catch (err) {
      console.error('Request error:', err);
      return error(
        'INTERNAL_ERROR',
        'An internal error occurred',
        500,
        env.ENVIRONMENT === 'development' ? String(err) : undefined
      );
    }
  },
};


