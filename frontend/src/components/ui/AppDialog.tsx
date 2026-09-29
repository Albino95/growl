import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import PrimaryButton from './PrimaryButton';

export type DialogButton = {
  label: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export type DialogRequest = {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
};

type Listener = (req: DialogRequest | null) => void;

let nextId = 1;
let current: DialogRequest | null = null;
const listeners = new Set<Listener>();
const queue: DialogRequest[] = [];

function notify() {
  listeners.forEach((l) => l(current));
}

function present(req: DialogRequest) {
  if (current) {
    queue.push(req);
    return;
  }
  current = req;
  notify();
}

function dismiss() {
  current = queue.shift() || null;
  notify();
}

export function subscribeDialog(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

export function showAppAlert(title: string, message?: string): Promise<void> {
  return new Promise((resolve) => {
    present({
      id: nextId++,
      title,
      message,
      buttons: [
        {
          label: 'Got it',
          style: 'default',
          onPress: () => resolve(),
        },
      ],
    });
  });
}

export function showAppConfirm(
  title: string,
  message: string,
  options?: { confirmLabel?: string; cancelLabel?: string; destructive?: boolean }
): Promise<boolean> {
  const confirmLabel = options?.confirmLabel ?? 'OK';
  const cancelLabel = options?.cancelLabel ?? 'Cancel';
  return new Promise((resolve) => {
    present({
      id: nextId++,
      title,
      message,
      buttons: [
        {
          label: cancelLabel,
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          label: confirmLabel,
          style: options?.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
    });
  });
}

function iconFor(req: DialogRequest): keyof typeof Ionicons.glyphMap {
  const destructive = req.buttons.some((b) => b.style === 'destructive');
  if (destructive) return 'warning-outline';
  if (req.buttons.length > 1) return 'help-circle-outline';
  return 'information-circle-outline';
}

/** Mount once near the app root so alertMessage / confirmAsync use branded modals. */
export default function AppDialogHost() {
  const [request, setRequest] = useState<DialogRequest | null>(null);

  useEffect(() => subscribeDialog(setRequest), []);

  const closeWith = (btn?: DialogButton) => {
    btn?.onPress?.();
    dismiss();
  };

  if (!request) return null;

  const icon = iconFor(request);
  const destructive = request.buttons.some((b) => b.style === 'destructive');
  const multi = request.buttons.length > 1;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        const cancel = request.buttons.find((b) => b.style === 'cancel');
        closeWith(cancel || request.buttons[0]);
      }}
    >
      <View style={tw`flex-1 items-center justify-center px-6`}>
        <Pressable
          style={tw`absolute inset-0 bg-black/45`}
          onPress={() => {
            const cancel = request.buttons.find((b) => b.style === 'cancel');
            if (cancel) closeWith(cancel);
          }}
        />
        <View
          style={[
            tw`w-full max-w-sm rounded-3xl px-5 pt-5 pb-4 border`,
            { backgroundColor: '#FFFcf7', borderColor: '#E7E5E4' },
          ]}
        >
          <View
            style={[
              tw`w-12 h-12 rounded-2xl items-center justify-center mb-3`,
              { backgroundColor: destructive ? '#FEE2E2' : '#ECFDF5' },
            ]}
          >
            <Ionicons name={icon} size={24} color={destructive ? '#DC2626' : '#059669'} />
          </View>
          <Text style={{ color: '#1C1917', fontSize: 18, fontWeight: '700', marginBottom: 4 }}>
            {request.title}
          </Text>
          {request.message ? (
            <Text
              style={{
                color: '#78716C',
                fontSize: 14,
                lineHeight: 20,
                marginBottom: 16,
              }}
            >
              {request.message}
            </Text>
          ) : (
            <View style={tw`mb-3`} />
          )}
          <View style={multi ? tw`flex-row gap-2` : tw`flex-col`}>
            {request.buttons.map((btn) => {
              const isCancel = btn.style === 'cancel';
              const isDestructive = btn.style === 'destructive';
              return (
                <View key={`${btn.label}-${request.id}`} style={multi ? tw`flex-1` : undefined}>
                  <PrimaryButton
                    label={btn.label || (isCancel ? 'Cancel' : 'Got it')}
                    onPress={() => closeWith(btn)}
                    variant={isCancel ? 'ghost' : 'solid'}
                    style={
                      isDestructive
                        ? { backgroundColor: '#DC2626', borderColor: '#DC2626' }
                        : undefined
                    }
                  />
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
