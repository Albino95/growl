import type { User } from '../store/slices/authSlice';

/** Business shell is shown only when the API reports isBusiness (admin-provisioned accounts). */
export function shouldShowBusinessShell(user: User | null): boolean {
  return !!user?.isBusiness;
}
