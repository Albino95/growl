/**
 * Authenticated profile updates (categories persist to D1 and trigger cohort friend sync).
 */

import { request } from './http';

export type ProfileUpdatePayload = {
  username?: string;
  avatar?: string;
  categories?: string[];
};

export async function updateProfileOnServer(payload: ProfileUpdatePayload): Promise<void> {
  await request('/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
