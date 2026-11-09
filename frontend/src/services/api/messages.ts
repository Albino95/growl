/**
 * Messages API service — friend-only direct messaging
 */

import { request } from './http';

export interface MessagePeer {
  id: string;
  username: string;
  avatar?: string | null;
  is_instructor?: boolean;
  is_business?: boolean;
}

export interface ConversationSummary {
  id: string;
  peer: MessagePeer;
  coaching?: boolean;
  last_message?: string | null;
  last_sender_id?: string | null;
  last_message_at?: string | null;
  unread?: boolean;
  created_at: string;
  updated_at: string;
}

export type MessageReactionEmoji = 'love' | 'fire' | 'laugh' | 'wow' | 'seed' | 'clap';

export type MessageReactions = {
  counts: Partial<Record<MessageReactionEmoji, number>>;
  mine: MessageReactionEmoji | null;
};

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  is_own: boolean;
  reactions?: MessageReactions;
}

export async function getConversations(): Promise<{
  success: boolean;
  data: { conversations: ConversationSummary[] };
}> {
  return request('/messages/conversations');
}

export async function getUnreadMessageCount(): Promise<number> {
  try {
    const res = await request<{ success: boolean; data: { unread_count: number } }>(
      '/messages/unread-count'
    );
    return res.data?.unread_count ?? 0;
  } catch {
    return 0;
  }
}

export async function createConversation(targetUserId: string): Promise<{
  success: boolean;
  data: {
    conversation: ConversationSummary;
    created: boolean;
  };
}> {
  return request('/messages/conversations', {
    method: 'POST',
    body: JSON.stringify({ targetUserId }),
  });
}

export async function getMessages(
  conversationId: string,
  params?: { limit?: number; offset?: number }
): Promise<{
  success: boolean;
  data: { messages: ChatMessage[]; peer_last_read_at?: string | null; limit: number; offset: number };
}> {
  const query = new URLSearchParams();
  if (params?.limit) query.append('limit', String(params.limit));
  if (params?.offset) query.append('offset', String(params.offset));
  const qs = query.toString();
  return request(
    `/messages/conversations/${encodeURIComponent(conversationId)}/messages${qs ? `?${qs}` : ''}`
  );
}

export async function sendMessage(
  conversationId: string,
  body: string
): Promise<{
  success: boolean;
  data: ChatMessage;
}> {
  return request(`/messages/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export async function reactToMessage(
  conversationId: string,
  messageId: string,
  emoji: MessageReactionEmoji
): Promise<MessageReactions> {
  const res = await request<{ success: boolean; data: { reactions: MessageReactions } }>(
    `/messages/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reaction`,
    {
      method: 'PUT',
      body: JSON.stringify({ emoji }),
    }
  );
  return res.data?.reactions || { counts: {}, mine: null };
}
