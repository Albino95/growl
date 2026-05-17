/**
 * Image utility functions for generating placeholder images
 */

/**
 * Get avatar image URL based on user ID or username
 */
export function getAvatarUrl(userId: string, username?: string): string {
  // Use pravatar.cc for consistent avatars based on user ID
  const seed = userId || username || 'default';
  return `https://i.pravatar.cc/150?img=${seed.charCodeAt(0) % 70 + 1}`;
}

/**
 * Get category-based image URL with activity-specific images
 */
export function getCategoryImageUrl(category: string, subcategory?: string): string {
  const categoryMap: Record<string, string> = {
    // Fitness & Health
    fitness: 'https://picsum.photos/seed/fitness/800/600',
    'losing-weight': 'https://images.unsplash.com/photo-1517836357483-507a3093906b?w=800&h=600&fit=crop&q=80',
    'gaining-weight': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&h=600&fit=crop&q=80',
    running: 'https://images.unsplash.com/photo-1544966503-7cc5ac882d5f?w=800&h=600&fit=crop&q=80',
    cycling: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=600&fit=crop&q=80',
    swimming: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=800&h=600&fit=crop&q=80',
    'weight-training': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&h=600&fit=crop&q=80',
    
    // Art & Creativity
    art: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&h=600&fit=crop&q=80',
    painting: 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=800&h=600&fit=crop&q=80',
    drawing: 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=800&h=600&fit=crop&q=80',
    photography: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=800&h=600&fit=crop&q=80',
    sculpture: 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=800&h=600&fit=crop&q=80',
    
    // Music
    music: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=600&fit=crop&q=80',
    piano: 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=800&h=600&fit=crop&q=80',
    guitar: 'https://images.unsplash.com/photo-1516924962500-2b4b3b99ea02?w=800&h=600&fit=crop&q=80',
    singing: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=600&fit=crop&q=80',
    drums: 'https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=800&h=600&fit=crop&q=80',
    
    // Mindset & Wellness
    mindset: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=600&fit=crop&q=80',
    meditation: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=600&fit=crop&q=80',
    yoga: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=600&fit=crop&q=80',
    mindfulness: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=600&fit=crop&q=80',
    'stress-management': 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=600&fit=crop&q=80',
    
    // Cooking & Food
    cooking: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&h=600&fit=crop&q=80',
    baking: 'https://images.unsplash.com/photo-1486427944299-d1955d23e34d?w=800&h=600&fit=crop&q=80',
    'meal-prep': 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&h=600&fit=crop&q=80',
    nutrition: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&h=600&fit=crop&q=80',
    
    // Learning & Education
    reading: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800&h=600&fit=crop&q=80',
    learning: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&h=600&fit=crop&q=80',
    languages: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800&h=600&fit=crop&q=80',
    coding: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=800&h=600&fit=crop&q=80',
    
    // Lifestyle
    travel: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&h=600&fit=crop&q=80',
    hiking: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop&q=80',
    gardening: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&h=600&fit=crop&q=80',
    'home-improvement': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=600&fit=crop&q=80',
    
    default: 'https://picsum.photos/seed/default/800/600',
  };

  const key = subcategory || category;
  return categoryMap[key.toLowerCase()] || categoryMap[category.toLowerCase()] || categoryMap.default;
}

/**
 * Get post image URL based on category
 */
export function getPostImageUrl(category: string, postId?: string): string {
  if (postId) {
    // Use postId for consistent image per post
    const index = postId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    // Use category-based images with variation
    const baseUrl = getCategoryImageUrl(category);
    // Add variation based on postId
    return `${baseUrl}&sig=${index % 100}`;
  }
  return getCategoryImageUrl(category);
}

/**
 * Get story thumbnail URL
 */
export function getStoryThumbnailUrl(userId: string): string {
  return getAvatarUrl(userId);
}

/**
 * Get story image URL based on user ID or story ID
 */
export function getStoryImageUrl(userId: string, storyId?: string): string {
  // Use a seed based on userId and storyId for consistent images
  const seed = storyId ? `${userId}-${storyId}` : userId;
  // Use picsum.photos for variety with consistent seeding
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/1200`;
}

/**
 * Post image URL from API may be https, device URI, or legacy bare paths — normalize for Image source.
 */
export function resolvePostMediaUri(
  raw: string | null | undefined,
  category: string,
  postId: string
): string {
  const s = (raw || '').trim();
  if (!s) return getPostImageUrl(category, postId);
  const lower = s.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return s;
  if (
    lower.startsWith('file://') ||
    lower.startsWith('content://') ||
    lower.startsWith('ph://') ||
    lower.startsWith('blob:') ||
    lower.startsWith('data:')
  ) {
    return s;
  }
  return getPostImageUrl(category, postId);
}

/**
 * Story API may return https URLs, device file/content URIs, or legacy placeholders (emoji / bare paths).
 * Anything that is not a loadable remote/local URI gets a deterministic picsum fallback so UI never shows raw paths.
 */
export function resolveStoryDisplayUri(
  raw: string | null | undefined,
  userId: string,
  storyId?: string
): string {
  const s = (raw || '').trim();
  if (!s) return getStoryImageUrl(userId, storyId);
  const lower = s.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return s;
  if (
    lower.startsWith('file://') ||
    lower.startsWith('content://') ||
    lower.startsWith('ph://') ||
    lower.startsWith('blob:') ||
    lower.startsWith('data:')
  ) {
    return s;
  }
  return getStoryImageUrl(userId, storyId);
}

/** Avatar from metadata may be emoji or invalid — prefer remote URL or pravatar fallback */
export function resolveAvatarUri(userId: string, username?: string, raw?: string | null): string {
  const s = (raw || '').trim();
  if (!s) return getAvatarUrl(userId, username);
  const lower = s.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return s;
  if (
    lower.startsWith('file://') ||
    lower.startsWith('content://') ||
    lower.startsWith('ph://') ||
    lower.startsWith('blob:') ||
    lower.startsWith('data:')
  ) {
    return s;
  }
  return getAvatarUrl(userId, username);
}

/**
 * Get product image URL based on category or product ID
 * Uses category-specific images for better relevance
 */
export function getProductImageUrl(category: string, productId?: string): string {
  // Use category-based images for better relevance
  const baseUrl = getCategoryImageUrl(category);
  
  // If productId provided, add variation for different products in same category
  if (productId) {
    const index = productId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    // Add variation parameter to get different images for same category
    return `${baseUrl}&sig=${index % 50}`;
  }
  return baseUrl;
}

/**
 * Get product images array (for products with multiple images)
 * Uses category-based images with variations
 */
export function getProductImages(category: string, productId: string, count: number = 3): string[] {
  const images: string[] = [];
  const baseUrl = getCategoryImageUrl(category);
  
  for (let i = 0; i < count; i++) {
    const seed = `${productId}-${i}`;
    const index = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    // Use category image with variation for each image in the array
    images.push(`${baseUrl}&sig=${(index + i * 10) % 50}`);
  }
  return images;
}

/**
 * Get random image for variety
 */
export function getRandomImageUrl(seed: string, width: number = 800, height: number = 600): string {
  const index = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return `https://picsum.photos/seed/${index}/${width}/${height}`;
}
