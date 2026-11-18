import React from 'react';
import ReplySheet from './ReplySheet';
import { QUESTION_MAX } from '../../services/api/engage';

/** Customer asks the shop a question about a product. */
export default function AskQuestionSheet({
  visible,
  productName,
  busy,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  productName?: string | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (body: string) => void;
}) {
  return (
    <ReplySheet
      visible={visible}
      title="Ask the shop"
      hint={`${productName ? `About ${productName}. ` : ''}The shop gets a notification. Once they answer, everyone can see it.`}
      placeholder="Sizes, materials, delivery…"
      maxLength={QUESTION_MAX}
      submitLabel="Send question"
      busy={busy}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}
