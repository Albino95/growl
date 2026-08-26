import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';

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
          label: 'OK',
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

function buttonClasses(style: DialogButton['style'], primary: boolean) {
  if (style === 'destructive') {
    return primary
      ? tw`bg-red-600 border-red-500`
      : tw`bg-red-50 border-red-200`;
  }
  if (style === 'cancel') {
    return tw`bg-stone-100 border-stone-200`;
  }
  return tw`bg-brand-600 border-brand-500`;
}

function buttonTextClasses(style: DialogButton['style']) {
  if (style === 'cancel') return tw`text-stone-700`;
  if (style === 'destructive') return tw`text-white`;
  return tw`text-white`;
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
          style={tw`w-full max-w-sm bg-[#FFFcf7] rounded-3xl px-5 pt-5 pb-4 border border-stone-200`}
        >
          <View
            style={[
              tw`w-12 h-12 rounded-2xl items-center justify-center mb-3`,
              destructive ? tw`bg-red-100` : tw`bg-brand-50`,
            ]}
          >
            <Ionicons
              name={icon}
              size={24}
              color={destructive ? '#DC2626' : '#059669'}
            />
          </View>
          <Text style={tw`text-stone-900 text-lg font-bold mb-1`}>{request.title}</Text>
          {request.message ? (
            <Text style={tw`text-stone-500 text-sm leading-5 mb-4`}>{request.message}</Text>
          ) : (
            <View style={tw`mb-3`} />
          )}
          <View
            style={
              request.buttons.length > 1
                ? tw`flex-row gap-2`
                : tw`flex-col`
            }
          >
            {request.buttons.map((btn, index) => {
              const primary =
                btn.style === 'default' ||
                btn.style === 'destructive' ||
                (request.buttons.length === 1 && index === 0);
              return (
                <Pressable
                  key={`${btn.label}-${index}`}
                  onPress={() => closeWith(btn)}
                  style={[
                    tw`flex-1 py-3.5 rounded-2xl border items-center`,
                    buttonClasses(btn.style, primary),
                  ]}
                >
                  <Text style={[tw`font-bold text-sm`, buttonTextClasses(btn.style)]}>
                    {btn.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
