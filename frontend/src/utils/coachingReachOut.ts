import { startCoachingInquiry } from '../services/api/instructor';
import { getRootNavigator } from '../app/navigation/rootNavigation';

export async function openCoachingReachOut(
  navigation: { getParent?: () => unknown } | null | undefined,
  instructorId: string,
  draftText?: string
): Promise<void> {
  const res = await startCoachingInquiry(instructorId, draftText);
  const root = getRootNavigator(navigation);
  root?.navigate('Messages', {
    conversationId: res.conversation_id || undefined,
    targetUserId: instructorId,
    draftText: res.conversation_id ? undefined : draftText,
  });
}
