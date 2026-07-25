import { Env } from './types';
import { attachCors, cors, error, json } from './utils/response';
import * as authRoutes from './routes/auth';
import * as feedRoutes from './routes/feed';
import * as commentRoutes from './routes/comments';
import * as marketplaceRoutes from './routes/marketplace';
import * as instructorRoutes from './routes/instructor';
import * as businessRoutes from './routes/business';
import * as profileRoutes from './routes/profile';
import * as storiesRoutes from './routes/stories';
import * as friendsRoutes from './routes/friends';
import * as mediaRoutes from './routes/media';
import * as privacyRoutes from './routes/privacy';
import * as journalRoutes from './routes/journal';
import * as messagesRoutes from './routes/messages';
import * as adminAuthRoutes from './routes/admin/auth';
import * as adminModerationRoutes from './routes/admin/moderation';
import * as adminUsersRoutes from './routes/admin/users';
import * as adminPrivacyRoutes from './routes/admin/privacy';
import * as adminBusinessRoutes from './routes/admin/business';
import * as adminAuditRoutes from './routes/admin/audit';
import * as adminDashboardRoutes from './routes/admin/dashboard';

/**
 * Main request handler
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await handleRequest(request, env);
    return attachCors(request, env, response);
  },
};

async function handleRequest(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return cors(request, env);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // API version prefix
    const apiPrefix = `/api/${env.API_VERSION || 'v1'}`;

    // Root route - API information
    if (path === '/' || path === '') {
      return json({
        name: 'Growl API',
        version: env.API_VERSION || 'v1',
        environment: env.ENVIRONMENT || 'development',
        status: 'running',
        endpoints: {
          health: `${apiPrefix}/health`,
          auth: {
            signUp: `${apiPrefix}/auth/sign-up`,
            signIn: `${apiPrefix}/auth/sign-in`,
            signOut: `${apiPrefix}/auth/sign-out`,
            sso: `${apiPrefix}/auth/sso`,
            refresh: `${apiPrefix}/auth/refresh`,
            forgotPassword: `${apiPrefix}/auth/forgot-password`,
            resetPassword: `${apiPrefix}/auth/reset-password`,
          },
          feed: {
            getFeed: `${apiPrefix}/feed/feed`,
            createPost: `${apiPrefix}/feed/posts`,
            getUserPosts: `${apiPrefix}/feed/posts/user/:userId`,
          },
          marketplace: {
            products: `${apiPrefix}/marketplace/products`,
            orders: `${apiPrefix}/marketplace/orders`,
            paymentConfig: `${apiPrefix}/marketplace/payment-config`,
            checkoutSession: `${apiPrefix}/marketplace/checkout-session`,
            webhook: `${apiPrefix}/marketplace/webhook`,
          },
          profile: `${apiPrefix}/profile`,
          publicProfileByUserId: `${apiPrefix}/profile/user/:userId`,
          social: {
            friends: `${apiPrefix}/social/friends`,
            friendshipStatus: `${apiPrefix}/social/friends/status/:userId`,
          },
          stories: `${apiPrefix}/stories`,
          journal: `${apiPrefix}/journal/entries`,
          messages: `${apiPrefix}/messages/conversations`,
          media: {
            upload: `${apiPrefix}/media/upload`,
            get: `${apiPrefix}/media/:key`,
          },
        },
        documentation: 'See API documentation for full endpoint details',
      });
    }

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
      if (path === `${apiPrefix}/auth/sso` && request.method === 'POST') {
        return authRoutes.signInWithSSO(request, env);
      }
      if (path === `${apiPrefix}/auth/verify-email` && request.method === 'POST') {
        return authRoutes.verifyEmail(request, env);
      }
      if (path === `${apiPrefix}/auth/refresh` && request.method === 'POST') {
        return authRoutes.refresh(request, env);
      }
      if (path === `${apiPrefix}/auth/forgot-password` && request.method === 'POST') {
        return authRoutes.forgotPassword(request, env);
      }
      if (path === `${apiPrefix}/auth/reset-password` && request.method === 'POST') {
        return authRoutes.resetPassword(request, env);
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

      const likesListMatch = path.match(new RegExp(`^${apiPrefix}/feed/posts/([^/]+)/likes$`));
      if (likesListMatch && request.method === 'GET') {
        return feedRoutes.getPostLikes(request, env, likesListMatch[1]);
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
        if (request.method === 'PUT') {
          return marketplaceRoutes.updateProduct(request, env, productId);
        }
        if (request.method === 'DELETE') {
          return marketplaceRoutes.deleteProduct(request, env, productId);
        }
      }

      if (path === `${apiPrefix}/marketplace/payment-config` && request.method === 'GET') {
        return marketplaceRoutes.getPaymentConfig(request, env);
      }
      if (path === `${apiPrefix}/marketplace/checkout-session` && request.method === 'POST') {
        return marketplaceRoutes.createCheckoutSession(request, env);
      }
      if (path === `${apiPrefix}/marketplace/webhook` && request.method === 'POST') {
        return marketplaceRoutes.handleStripeWebhook(request, env);
      }

      if (path === `${apiPrefix}/marketplace/products` && request.method === 'GET') {
        return marketplaceRoutes.getProducts(request, env);
      }
      if (path === `${apiPrefix}/marketplace/products` && request.method === 'POST') {
        return marketplaceRoutes.createProduct(request, env);
      }
      // Order status update (check before generic orders route)
      const orderStatusMatch = path.match(new RegExp(`^${apiPrefix}/marketplace/orders/([^/]+)/status$`));
      if (orderStatusMatch) {
        const orderId = orderStatusMatch[1];
        if (request.method === 'PATCH') {
          return marketplaceRoutes.updateOrderStatus(request, env, orderId);
        }
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

      const endorsementStatusMatch = path.match(
        new RegExp(`^${apiPrefix}/instructor/candidates/([^/]+)/endorsement-status$`)
      );
      if (endorsementStatusMatch && request.method === 'GET') {
        return instructorRoutes.getEndorsementStatus(request, env, endorsementStatusMatch[1]);
      }

      if (path === `${apiPrefix}/instructor/eligibility` && request.method === 'GET') {
        return instructorRoutes.getEligibility(request, env);
      }
      if (path === `${apiPrefix}/instructor/claim` && request.method === 'POST') {
        return instructorRoutes.claimInstructor(request, env);
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
      if (path === `${apiPrefix}/business/customers` && request.method === 'GET') {
        return businessRoutes.getCustomers(request, env);
      }
      if (path === `${apiPrefix}/business/export/orders` && request.method === 'GET') {
        return businessRoutes.exportOrdersCsv(request, env);
      }
      if (path === `${apiPrefix}/business/export/products` && request.method === 'GET') {
        return businessRoutes.exportProductsCsv(request, env);
      }
      if (path === `${apiPrefix}/business/notifications` && request.method === 'GET') {
        return businessRoutes.listNotifications(request, env);
      }
      const businessNotificationReadMatch = path.match(
        new RegExp(`^${apiPrefix}/business/notifications/([^/]+)/read$`)
      );
      if (businessNotificationReadMatch && request.method === 'PATCH') {
        return businessRoutes.markNotificationRead(request, env, businessNotificationReadMatch[1]);
      }
      if (path === `${apiPrefix}/business/promo-codes` && request.method === 'GET') {
        return businessRoutes.listPromoCodes(request, env);
      }
      if (path === `${apiPrefix}/business/promo-codes` && request.method === 'POST') {
        return businessRoutes.createPromoCode(request, env);
      }
      const businessPromoMatch = path.match(
        new RegExp(`^${apiPrefix}/business/promo-codes/([^/]+)$`)
      );
      if (businessPromoMatch && request.method === 'PATCH') {
        return businessRoutes.updatePromoCode(request, env, businessPromoMatch[1]);
      }
      const businessOrderFulfillmentMatch = path.match(
        new RegExp(`^${apiPrefix}/business/orders/([^/]+)/fulfillment$`)
      );
      if (businessOrderFulfillmentMatch && request.method === 'PATCH') {
        return businessRoutes.updateOrderFulfillment(request, env, businessOrderFulfillmentMatch[1]);
      }
      const businessOrderRefundMatch = path.match(
        new RegExp(`^${apiPrefix}/business/orders/([^/]+)/refund-request$`)
      );
      if (businessOrderRefundMatch && request.method === 'POST') {
        return businessRoutes.requestOrderRefund(request, env, businessOrderRefundMatch[1]);
      }
      const businessOrderDetailMatch = path.match(new RegExp(`^${apiPrefix}/business/orders/([^/]+)$`));
      if (businessOrderDetailMatch && request.method === 'GET') {
        return businessRoutes.getBusinessOrderDetail(request, env, businessOrderDetailMatch[1]);
      }
      if (path === `${apiPrefix}/business/partnerships` && request.method === 'GET') {
        return businessRoutes.getPartnerships(request, env);
      }
      if (path === `${apiPrefix}/business/partnerships/discover` && request.method === 'GET') {
        return businessRoutes.getPartnershipDiscover(request, env);
      }
      if (path === `${apiPrefix}/business/partnerships/requests` && request.method === 'POST') {
        return businessRoutes.createPartnershipRequest(request, env);
      }
      const partnershipRequestMatch = path.match(
        new RegExp(`^${apiPrefix}/business/partnerships/requests/([^/]+)$`)
      );
      if (partnershipRequestMatch && request.method === 'PATCH') {
        return businessRoutes.updatePartnershipRequest(request, env, partnershipRequestMatch[1]);
      }
      if (path === `${apiPrefix}/business/analytics/timeseries` && request.method === 'GET') {
        return businessRoutes.getAnalyticsTimeseries(request, env);
      }
      if (path === `${apiPrefix}/business/analytics/funnel` && request.method === 'GET') {
        return businessRoutes.getAnalyticsFunnel(request, env);
      }
      if (path === `${apiPrefix}/business/analytics/top-products` && request.method === 'GET') {
        return businessRoutes.getTopProducts(request, env);
      }
      if (path === `${apiPrefix}/business/analytics/partnerships` && request.method === 'GET') {
        return businessRoutes.getPartnershipPerformance(request, env);
      }
      const partnershipUpdateMatch = path.match(
        new RegExp(`^${apiPrefix}/business/partnerships/([^/]+)$`)
      );
      if (
        partnershipUpdateMatch &&
        request.method === 'PATCH' &&
        partnershipUpdateMatch[1] !== 'requests' &&
        partnershipUpdateMatch[1] !== 'discover'
      ) {
        return businessRoutes.updatePartnership(request, env, partnershipUpdateMatch[1]);
      }
      if (path === `${apiPrefix}/business/campaigns` && request.method === 'GET') {
        return businessRoutes.listCampaigns(request, env);
      }
      if (path === `${apiPrefix}/business/campaigns` && request.method === 'POST') {
        return businessRoutes.createCampaign(request, env);
      }
      const campaignMatch = path.match(new RegExp(`^${apiPrefix}/business/campaigns/([^/]+)$`));
      if (campaignMatch && request.method === 'PATCH') {
        return businessRoutes.updateCampaign(request, env, campaignMatch[1]);
      }
      if (path === `${apiPrefix}/business/settings` && request.method === 'GET') {
        return businessRoutes.getBusinessSettings(request, env);
      }
      if (path === `${apiPrefix}/business/settings` && request.method === 'PUT') {
        return businessRoutes.updateBusinessSettings(request, env);
      }

      // Stories routes
      const storyViewMatch = path.match(new RegExp(`^${apiPrefix}/stories/([^/]+)/view$`));
      if (storyViewMatch) {
        const storyId = storyViewMatch[1];
        if (request.method === 'POST') {
          return storiesRoutes.viewStory(request, env, storyId);
        }
      }

      const userStoriesMatch = path.match(new RegExp(`^${apiPrefix}/stories/user/([^/]+)$`));
      if (userStoriesMatch) {
        const userId = userStoriesMatch[1];
        if (request.method === 'GET') {
          return storiesRoutes.getUserStories(request, env, userId);
        }
      }

      const storyMatch = path.match(new RegExp(`^${apiPrefix}/stories/([^/]+)$`));
      if (storyMatch) {
        const storyId = storyMatch[1];
        if (request.method === 'DELETE') {
          return storiesRoutes.deleteStory(request, env, storyId);
        }
      }

      if (path === `${apiPrefix}/stories` && request.method === 'GET') {
        return storiesRoutes.getStories(request, env);
      }
      if (path === `${apiPrefix}/stories` && request.method === 'POST') {
        return storiesRoutes.createStory(request, env);
      }

      // Media routes
      if (path === `${apiPrefix}/media/upload` && request.method === 'POST') {
        return mediaRoutes.uploadMedia(request, env);
      }
      const mediaMatch = path.match(new RegExp(`^${apiPrefix}/media/(.+)$`));
      if (mediaMatch && request.method === 'GET') {
        return mediaRoutes.getMedia(request, env, mediaMatch[1]);
      }

      // Journal routes
      const journalUserMatch = path.match(new RegExp(`^${apiPrefix}/journal/entries/user/([^/]+)$`));
      if (journalUserMatch && request.method === 'GET') {
        return journalRoutes.getUserPublicJournalEntries(request, env, journalUserMatch[1]);
      }

      const journalEntryMatch = path.match(new RegExp(`^${apiPrefix}/journal/entries/([^/]+)$`));
      if (journalEntryMatch) {
        const entryId = journalEntryMatch[1];
        if (request.method === 'PUT') {
          return journalRoutes.updateJournalEntry(request, env, entryId);
        }
        if (request.method === 'DELETE') {
          return journalRoutes.deleteJournalEntry(request, env, entryId);
        }
      }

      if (path === `${apiPrefix}/journal/entries` && request.method === 'GET') {
        return journalRoutes.getJournalEntries(request, env);
      }
      if (path === `${apiPrefix}/journal/entries` && request.method === 'POST') {
        return journalRoutes.createJournalEntry(request, env);
      }

      // Messages routes
      const conversationMessagesMatch = path.match(
        new RegExp(`^${apiPrefix}/messages/conversations/([^/]+)/messages$`)
      );
      if (conversationMessagesMatch) {
        const conversationId = conversationMessagesMatch[1];
        if (request.method === 'GET') {
          return messagesRoutes.getMessages(request, env, conversationId);
        }
        if (request.method === 'POST') {
          return messagesRoutes.sendMessage(request, env, conversationId);
        }
      }

      if (path === `${apiPrefix}/messages/conversations` && request.method === 'GET') {
        return messagesRoutes.getConversations(request, env);
      }
      if (path === `${apiPrefix}/messages/conversations` && request.method === 'POST') {
        return messagesRoutes.createConversation(request, env);
      }

      // Friends / cohort social graph
      const friendStatusMatch = path.match(new RegExp(`^${apiPrefix}/social/friends/status/([^/]+)$`));
      if (friendStatusMatch && request.method === 'GET') {
        return friendsRoutes.getFriendshipStatus(request, env, friendStatusMatch[1]);
      }

      const friendDeleteMatch = path.match(new RegExp(`^${apiPrefix}/social/friends/([^/]+)$`));
      if (friendDeleteMatch && request.method === 'DELETE') {
        return friendsRoutes.removeFriend(request, env, friendDeleteMatch[1]);
      }
      const blockDeleteMatch = path.match(new RegExp(`^${apiPrefix}/social/block/([^/]+)$`));
      if (blockDeleteMatch && request.method === 'DELETE') {
        return friendsRoutes.unblockUser(request, env, blockDeleteMatch[1]);
      }
      const muteDeleteMatch = path.match(new RegExp(`^${apiPrefix}/social/mute/([^/]+)$`));
      if (muteDeleteMatch && request.method === 'DELETE') {
        return friendsRoutes.unmuteUser(request, env, muteDeleteMatch[1]);
      }

      if (path === `${apiPrefix}/social/friends/sync-cohort` && request.method === 'POST') {
        return friendsRoutes.syncCohortFriendsRoute(request, env);
      }
      if (path === `${apiPrefix}/social/friends/connections` && request.method === 'GET') {
        return friendsRoutes.listConnections(request, env);
      }
      if (path === `${apiPrefix}/social/friends` && request.method === 'GET') {
        return friendsRoutes.listFriends(request, env);
      }
      if (path === `${apiPrefix}/social/friends` && request.method === 'POST') {
        return friendsRoutes.addFriend(request, env);
      }
      if (path === `${apiPrefix}/social/block` && request.method === 'POST') {
        return friendsRoutes.blockUser(request, env);
      }
      if (path === `${apiPrefix}/social/mute` && request.method === 'POST') {
        return friendsRoutes.muteUser(request, env);
      }
      if (path === `${apiPrefix}/social/report` && request.method === 'POST') {
        return friendsRoutes.reportContent(request, env);
      }

      // User privacy (GDPR / store compliance)
      if (path === `${apiPrefix}/privacy/export` && request.method === 'GET') {
        return privacyRoutes.exportAccountData(request, env);
      }
      if (path === `${apiPrefix}/privacy/delete-account` && request.method === 'POST') {
        return privacyRoutes.deleteAccount(request, env);
      }

      // Profile routes (specific paths before /profile)
      const publicProfileMatch = path.match(new RegExp(`^${apiPrefix}/profile/user/([^/]+)$`));
      if (publicProfileMatch && request.method === 'GET') {
        return profileRoutes.getPublicProfile(request, env, decodeURIComponent(publicProfileMatch[1]));
      }

      if (path === `${apiPrefix}/profile` && request.method === 'GET') {
        return profileRoutes.getProfile(request, env);
      }
      if (path === `${apiPrefix}/profile` && request.method === 'PUT') {
        return profileRoutes.updateProfile(request, env);
      }

      // Admin routes
      if (path === `${apiPrefix}/admin/auth/login` && request.method === 'POST') {
        return adminAuthRoutes.adminLogin(request, env);
      }
      if (path === `${apiPrefix}/admin/auth/logout` && request.method === 'POST') {
        return adminAuthRoutes.adminLogout(request, env);
      }
      if (path === `${apiPrefix}/admin/auth/me` && request.method === 'GET') {
        return adminAuthRoutes.adminMe(request, env);
      }
      if (path === `${apiPrefix}/admin/auth/mfa/setup` && request.method === 'POST') {
        return adminAuthRoutes.adminSetupMfaSecret(request, env);
      }
      if (path === `${apiPrefix}/admin/auth/mfa/enable` && request.method === 'POST') {
        return adminAuthRoutes.adminEnableMfa(request, env);
      }
      if (path === `${apiPrefix}/admin/auth/bootstrap` && request.method === 'POST') {
        return adminAuthRoutes.adminBootstrap(request, env);
      }

      if (path === `${apiPrefix}/admin/dashboard/overview` && request.method === 'GET') {
        return adminDashboardRoutes.getAdminOverview(request, env);
      }
      if (path === `${apiPrefix}/admin/dashboard/analytics` && request.method === 'GET') {
        return adminDashboardRoutes.getAdminAnalytics(request, env);
      }

      if (path === `${apiPrefix}/admin/moderation/reports` && request.method === 'GET') {
        return adminModerationRoutes.listReports(request, env);
      }
      const adminReportMatch = path.match(new RegExp(`^${apiPrefix}/admin/moderation/reports/([^/]+)$`));
      if (adminReportMatch && request.method === 'GET') {
        return adminModerationRoutes.getReport(request, env, adminReportMatch[1]);
      }
      if (adminReportMatch && request.method === 'PATCH') {
        return adminModerationRoutes.assignReport(request, env, adminReportMatch[1]);
      }
      const adminReportDecisionMatch = path.match(
        new RegExp(`^${apiPrefix}/admin/moderation/reports/([^/]+)/decision$`)
      );
      if (adminReportDecisionMatch && request.method === 'POST') {
        return adminModerationRoutes.decideReport(request, env, adminReportDecisionMatch[1]);
      }
      if (path === `${apiPrefix}/admin/moderation/reports/batch/decision` && request.method === 'POST') {
        return adminModerationRoutes.batchDecideReports(request, env);
      }
      if (path === `${apiPrefix}/admin/moderation/appeals` && request.method === 'GET') {
        return adminModerationRoutes.listAppeals(request, env);
      }
      const adminAppealMatch = path.match(
        new RegExp(`^${apiPrefix}/admin/moderation/appeals/([^/]+)/decision$`)
      );
      if (adminAppealMatch && request.method === 'POST') {
        return adminModerationRoutes.decideAppeal(request, env, adminAppealMatch[1]);
      }

      if (path === `${apiPrefix}/admin/users` && request.method === 'GET') {
        return adminUsersRoutes.listUsers(request, env);
      }
      const adminUserMatch = path.match(new RegExp(`^${apiPrefix}/admin/users/([^/]+)$`));
      if (adminUserMatch && request.method === 'GET') {
        return adminUsersRoutes.getUser(request, env, adminUserMatch[1]);
      }
      const adminUserEnforceMatch = path.match(
        new RegExp(`^${apiPrefix}/admin/users/([^/]+)/enforcement$`)
      );
      if (adminUserEnforceMatch && request.method === 'POST') {
        return adminUsersRoutes.enforceUser(request, env, adminUserEnforceMatch[1]);
      }
      const adminUserRolesMatch = path.match(new RegExp(`^${apiPrefix}/admin/users/([^/]+)/roles$`));
      if (adminUserRolesMatch && request.method === 'PATCH') {
        return adminUsersRoutes.updateUserRoles(request, env, adminUserRolesMatch[1]);
      }

      if (path === `${apiPrefix}/admin/privacy/requests` && request.method === 'GET') {
        return adminPrivacyRoutes.listPrivacyRequests(request, env);
      }
      if (path === `${apiPrefix}/admin/privacy/requests` && request.method === 'POST') {
        return adminPrivacyRoutes.createPrivacyRequest(request, env);
      }
      const adminPrivacyMatch = path.match(new RegExp(`^${apiPrefix}/admin/privacy/requests/([^/]+)$`));
      if (adminPrivacyMatch && request.method === 'PATCH') {
        return adminPrivacyRoutes.updatePrivacyRequest(request, env, adminPrivacyMatch[1]);
      }
      const adminPrivacyExportMatch = path.match(
        new RegExp(`^${apiPrefix}/admin/privacy/users/([^/]+)/export$`)
      );
      if (adminPrivacyExportMatch && request.method === 'POST') {
        return adminPrivacyRoutes.exportUserData(request, env, adminPrivacyExportMatch[1]);
      }

      if (path === `${apiPrefix}/admin/business/accounts` && request.method === 'GET') {
        return adminBusinessRoutes.listBusinessAccounts(request, env);
      }
      if (path === `${apiPrefix}/admin/business/accounts` && request.method === 'POST') {
        return adminBusinessRoutes.createBusinessAccount(request, env);
      }
      const adminBusinessAccountMatch = path.match(
        new RegExp(`^${apiPrefix}/admin/business/accounts/([^/]+)$`)
      );
      if (adminBusinessAccountMatch && request.method === 'GET') {
        return adminBusinessRoutes.getBusinessAccount(request, env, adminBusinessAccountMatch[1]);
      }
      if (adminBusinessAccountMatch && request.method === 'PATCH') {
        return adminBusinessRoutes.updateBusinessAccount(request, env, adminBusinessAccountMatch[1]);
      }

      if (path === `${apiPrefix}/admin/business/orders` && request.method === 'GET') {
        return adminBusinessRoutes.listOrders(request, env);
      }
      const adminOrderMatch = path.match(new RegExp(`^${apiPrefix}/admin/business/orders/([^/]+)$`));
      if (adminOrderMatch && request.method === 'GET') {
        return adminBusinessRoutes.getOrder(request, env, adminOrderMatch[1]);
      }
      const adminRefundMatch = path.match(
        new RegExp(`^${apiPrefix}/admin/business/orders/([^/]+)/refund$`)
      );
      if (adminRefundMatch && request.method === 'POST') {
        return adminBusinessRoutes.refundOrder(request, env, adminRefundMatch[1]);
      }
      if (path === `${apiPrefix}/admin/business/partnerships/flags` && request.method === 'GET') {
        return adminBusinessRoutes.listPartnershipFlags(request, env);
      }
      if (path === `${apiPrefix}/admin/business/risk-signals` && request.method === 'GET') {
        return adminBusinessRoutes.getRiskSignals(request, env);
      }

      if (path === `${apiPrefix}/admin/audit/logs` && request.method === 'GET') {
        return adminAuditRoutes.listAuditLogs(request, env);
      }

      // Health check / ping endpoint
      if (path === `${apiPrefix}/health` && request.method === 'GET') {
        let dbStatus = 'not configured';
        let kvStatus = 'not configured';
        let r2Status = 'not configured';
        
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

        if (env.R2) {
          try {
            await env.R2.head('health-check');
            r2Status = 'connected';
          } catch {
            // head may 404 — binding still works
            r2Status = 'connected';
          }
        }

        return json({
          status: 'ok',
          timestamp: new Date().toISOString(),
          environment: env.ENVIRONMENT,
          database: dbStatus,
          kv: kvStatus,
          r2: r2Status,
          jwtConfigured: Boolean(env.JWT_SECRET?.trim()),
          paymentsEnabled: Boolean(env.STRIPE_SECRET_KEY?.trim()),
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
}


