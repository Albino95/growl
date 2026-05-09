// Environment bindings for Cloudflare Workers
export interface Env {
  DB: D1Database; // Required - configured in wrangler.toml
  KV: KVNamespace; // Required - configured in wrangler.toml
  R2?: R2Bucket; // Optional - not used yet
  ENVIRONMENT: string;
  JWT_SECRET: string;
  API_VERSION: string;
  /** Comma-separated lowercased emails that get is_business (and instructor) synced on sign-in */
  BUSINESS_BOOTSTRAP_EMAILS?: string;
}

// User types
export interface User {
  id: string;
  email: string;
  password_hash: string;
  points: number;
  is_instructor: boolean;
  is_business: boolean;
  metadata: string; // JSON string
  created_at: string;
  updated_at: string;
}

export interface UserMetadata {
  username?: string;
  avatar?: string;
  /** When set to "business", user is treated as a business account on sign-in (DB flags synced). */
  account_type?: string;
  categories?: string[];
  engagementHistory?: any[];
  instructorVotes?: any[];
  purchaseHistory?: any[];
  timePreferences?: any[];
  blockedUsers?: string[];
  mutedUsers?: string[];
}

export interface Post {
  id: string;
  user_id: string;
  image_url?: string;
  caption?: string;
  category: string;
  subcategory?: string;
  engagement_score: number;
  metadata: string; // JSON string
  created_at: string;
  updated_at: string;
}

export interface PostMetadata {
  likes?: number;
  comments?: number;
  isInstructor?: boolean;
  username?: string;
  avatar?: string;
}

export interface Product {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  price: number;
  stock: number;
  image_url?: string;
  images?: string; // JSON string array
  metadata: string; // JSON string
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  status: string;
  total: number;
  shipping_address: string; // JSON string
  metadata: string; // JSON string
  created_at: string;
  updated_at: string;
}

export interface RequestContext {
  isAuthenticated: boolean;
  userId?: string;
  user?: User;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    request_id?: string;
  };
}


