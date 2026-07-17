import React from 'react';
import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import EmptyState from '../ui/EmptyState';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  icon?: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function BusinessEmptyState({
  icon = 'storefront-outline',
  title,
  description,
  actionLabel,
  onAction,
}: Props) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
}
