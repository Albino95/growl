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
 * Get category-based image URL
 */
export function getCategoryImageUrl(category: string, subcategory?: string): string {
  const categoryMap: Record<string, string> = {
    fitness: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b84d4?w=800&h=600&fit=crop',
    'losing-weight': 'https://images.unsplash.com/photo-1571019613454-1cb2f99b84d4?w=800&h=600&fit=crop',
    'gaining-weight': 'https://images.unsplash.com/photo-1571019613454-1cb2f99b84d4?w=800&h=600&fit=crop',
    art: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&h=600&fit=crop',
    piano: 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=800&h=600&fit=crop',
    painting: 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=800&h=600&fit=crop',
    mindset: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=600&fit=crop',
    meditation: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=600&fit=crop',
    yoga: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=600&fit=crop',
    cooking: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&h=600&fit=crop',
    music: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=600&fit=crop',
    reading: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800&h=600&fit=crop',
    travel: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&h=600&fit=crop',
    default: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&h=600&fit=crop',
  };

  const key = subcategory || category;
  return categoryMap[key.toLowerCase()] || categoryMap[category.toLowerCase()] || categoryMap.default;
}

/**
 * Get story thumbnail URL
 */
export function getStoryThumbnailUrl(userId: string): string {
  return getAvatarUrl(userId);
}

/**
 * Get product image URL
 */
export function getProductImageUrl(category: string): string {
  return getCategoryImageUrl(category);
}

/**
 * Get random image for variety
 */
export function getRandomImageUrl(seed: string, width: number = 800, height: number = 600): string {
  const index = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return `https://picsum.photos/seed/${index}/${width}/${height}`;
}
