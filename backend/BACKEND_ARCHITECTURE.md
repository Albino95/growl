# Backend Architecture - Growl App

## Technology Stack Recommendation

### Primary Stack: Cloudflare Workers + D1 + Cloudflare Auth

**Why Cloudflare?**
- **Global Edge Network**: Low latency worldwide
- **Cost-Effective**: Pay-as-you-go pricing, generous free tier
- **Integrated Services**: Workers, D1 (SQLite), R2 (Object Storage), Auth, KV
- **Developer Experience**: Excellent tooling, TypeScript support
- **Scalability**: Auto-scales without configuration

### Core Services

#### 1. **Cloudflare Workers** (Serverless Functions)
- **Purpose**: API endpoints, business logic
- **Language**: TypeScript/JavaScript
- **Benefits**: 
  - Edge computing (runs close to users)
  - No cold starts
  - Integrated with other Cloudflare services
- **Use Cases**:
  - Authentication endpoints
  - Feed generation (metadata-based)
  - Marketplace recommendations
  - Instructor voting system
  - Business analytics

#### 2. **Cloudflare D1** (SQLite Database)
- **Purpose**: Primary database
- **Why SQLite?**: 
  - Simple, reliable
  - Perfect for read-heavy workloads
  - Easy backups
  - Low latency with Workers
- **Schema Considerations**:
  - Users (with metadata)
  - Posts (with categories, engagement metrics)
  - Products (business inventory)
  - Orders
  - Instructor partnerships
  - Voting/points system
  - Marketplace promotions

#### 3. **Cloudflare R2** (Object Storage)
- **Purpose**: Media storage (images, videos)
- **Benefits**: 
  - S3-compatible API
  - No egress fees
  - CDN integration
- **Use Cases**:
  - User avatars
  - Post images/videos
  - Product images
  - Instructor content

#### 4. **Cloudflare Auth** (Authentication)
- **Purpose**: User authentication
- **Features**:
  - Email/password
  - OAuth (Google, Facebook)
  - Session management
  - JWT tokens
- **Integration**: Seamless with Workers

#### 5. **Cloudflare KV** (Key-Value Store)
- **Purpose**: Caching, session data, real-time data
- **Use Cases**:
  - Feed cache (user-specific)
  - Marketplace promotion cache
  - Real-time engagement metrics
  - Rate limiting

### Alternative/Complementary Services

#### **PostgreSQL (Supabase/Neon)** - If more complex queries needed
- **When to use**: 
  - Complex joins
  - Advanced analytics
  - Full-text search
- **Integration**: Can use alongside D1 for specific use cases

#### **Redis (Upstash)** - For real-time features
- **Purpose**: Real-time caching, pub/sub
- **Use Cases**:
  - Live engagement metrics
  - Real-time notifications
  - Leaderboards

## Database Schema Design

### Core Tables

```sql
-- Users with metadata for personalization
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  points INTEGER DEFAULT 0,
  is_instructor BOOLEAN DEFAULT FALSE,
  is_business BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB -- Categories, interests, engagement patterns
);

-- Posts with engagement tracking
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  image_url TEXT,
  caption TEXT,
  category TEXT,
  subcategory TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  engagement_score REAL -- Calculated from likes, comments, shares
);

-- Products (Business inventory)
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  category TEXT,
  price REAL,
  stock INTEGER,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  business_id TEXT REFERENCES users(id),
  total REAL,
  status TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Instructor Partnerships
CREATE TABLE partnerships (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES users(id),
  instructor_id TEXT REFERENCES users(id),
  type TEXT, -- 'commission', 'fixed', 'hybrid'
  fee REAL,
  commission_rate REAL,
  status TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Marketplace Promotions
CREATE TABLE promotions (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES users(id),
  product_id TEXT REFERENCES products(id),
  budget REAL,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  target_categories TEXT[], -- Array of categories
  status TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Instructor Votes
CREATE TABLE votes (
  id TEXT PRIMARY KEY,
  instructor_id TEXT REFERENCES users(id),
  voter_id TEXT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(instructor_id, voter_id)
);
```

## API Architecture

### Endpoints Structure

```
/api/auth/
  POST /sign-in
  POST /sign-up
  POST /sign-out
  POST /sso

/api/feed/
  GET /feed - Personalized feed based on metadata
  POST /posts - Create post
  GET /posts/:id
  POST /posts/:id/like
  POST /posts/:id/comment

/api/marketplace/
  GET /products - Get products (with promotions)
  GET /products/:id
  POST /orders - Create order

/api/instructor/
  GET /instructors - List instructors
  GET /instructors/:id
  POST /instructors/:id/vote
  GET /instructors/:id/students
  POST /instructors/:id/homework

/api/business/
  GET /dashboard - KPI data
  GET /products - Inventory
  POST /products - Add product
  GET /orders
  GET /partnerships
  POST /partnerships - Create partnership
  POST /promotions - Create promotion

/api/admin/
  POST /users/:id/business - Grant business access
  GET /analytics
  GET /users
```

## Feed Generation Algorithm

### Metadata-Based Personalization

```typescript
interface UserMetadata {
  categories: string[];
  engagementHistory: {
    category: string;
    engagementRate: number;
  }[];
  instructorVotes: string[];
  purchaseHistory: string[];
  timePreferences: {
    hour: number;
    engagement: number;
  }[];
}

function generateFeed(userId: string, metadata: UserMetadata) {
  // 1. Get posts from user's categories
  // 2. Boost posts from voted instructors
  // 3. Apply engagement history weights
  // 4. Add promoted products from marketplace
  // 5. Sort by relevance score
  // 6. Cache in KV for 5 minutes
}
```

## Marketplace Promotion System

### How Promotions Work

1. **Business creates promotion**:
   - Selects products
   - Sets budget
   - Targets categories
   - Sets duration

2. **Promotion appears in marketplace**:
   - Sorted by bid amount
   - Filtered by user's categories
   - Shows "Promoted" badge

3. **No ads in feed**:
   - Feed is pure content
   - Marketplace is where promotions live
   - Better UX, higher conversion

## Instructor Voting System

### How It Works

1. **User accumulates points** (500+ required)
2. **Community votes** for instructor status
3. **Voting criteria**:
   - Post quality
   - Engagement rate
   - Category expertise
   - Community contribution

4. **Metadata impact**:
   - Instructor status affects feed ranking
   - Their posts get higher visibility
   - Can partner with businesses

## Deployment Strategy

### Development
- Local: Wrangler dev
- Testing: Cloudflare Workers preview

### Production
- Workers: Deploy via Wrangler
- D1: Migrations via Wrangler
- R2: Bucket creation via Dashboard/API
- Auth: Configure via Dashboard

### CI/CD
- GitHub Actions
- Auto-deploy on push to main
- Run migrations automatically

## Security Considerations

1. **Authentication**: Cloudflare Auth handles sessions
2. **Rate Limiting**: Built into Workers
3. **CORS**: Configure per endpoint
4. **Input Validation**: Zod schemas
5. **SQL Injection**: Parameterized queries (D1)
6. **XSS**: Sanitize user input
7. **CSRF**: Token validation

## Monitoring & Analytics

### Cloudflare Analytics
- Worker invocations
- Response times
- Error rates
- Bandwidth usage

### Custom Analytics
- User engagement metrics
- Business KPIs
- Instructor performance
- Marketplace conversion rates

## Cost Estimation (Monthly)

### Cloudflare Free Tier (Good for MVP)
- Workers: 100,000 requests/day
- D1: 5GB storage, 5M reads
- R2: 10GB storage
- KV: 100,000 reads/day
- Auth: 50,000 MAU

### Paid Tier (Scale)
- Workers: $5/month + $0.50 per million requests
- D1: $5/month + usage
- R2: $0.015/GB storage
- Auth: $0.10 per MAU

**Estimated MVP Cost**: $0-20/month
**Estimated Scale Cost**: $50-200/month (10K users)

## Migration Path

### Phase 1: MVP (Current)
- Cloudflare Workers + D1
- Basic auth
- Simple feed
- Basic marketplace

### Phase 2: Scale
- Add KV for caching
- Implement Redis for real-time
- Add analytics
- Optimize feed algorithm

### Phase 3: Advanced
- Machine learning for recommendations
- Advanced analytics
- Multi-region deployment
- Admin dashboard

## Recommendations

1. **Start with Cloudflare**: Best fit for this use case
2. **Use D1 for MVP**: Simple, fast, cost-effective
3. **Add KV for caching**: Improve feed performance
4. **Consider Supabase later**: If complex queries needed
5. **Keep it simple**: Don't over-engineer early

## Next Steps

1. Set up Cloudflare account
2. Create Workers project
3. Initialize D1 database
4. Set up R2 buckets
5. Configure Auth
6. Deploy first endpoint
7. Test locally with Wrangler

