import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/seo';

/** Public, indexable pages only (/i/* invites and /pitch are excluded on purpose). */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const lastModified = new Date();
  const paths = ['', '/privacy', '/terms', '/support', '/community', '/delete-account'];
  return paths.map((path) => ({
    url: `${siteUrl}${path || '/'}`,
    lastModified,
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : 0.6,
  }));
}
