import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Switch, TextInput, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme, useColorSchemeName } from '../../lib/tw';
import PressableScale from '../../components/ui/PressableScale';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import KeyboardInsetView from '../../components/ui/KeyboardInsetView';
import {
  KeyboardDoneAccessory,
  formInputAccessoryProps,
} from '../../components/ui/KeyboardDoneAccessory';
import {
  AWAY_MESSAGE_MAX,
  SAVED_REPLIES_MAX,
  getInboxSettings,
  saveInboxSettings,
  type AwaySchedule,
  type InboxSettings,
  type SavedReply,
} from '../../services/api/engage';
import { toast } from '../../state/useToastStore';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { toggleFeedback } from '../../theme/haptics';
import { verticalScrollProps } from '../../constants/scroll';
import { normalizeTime } from '../../components/productqa/shared';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Draft = { id?: string; title: string; body: string };

/** Business inbox: saved replies for the chat composer, and an away message. */
export default function InboxSettingsScreen() {
  useColorSchemeName();
  const [loaded, setLoaded] = useState<InboxSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [saving, setSaving] = useState(false);

  const [replies, setReplies] = useState<SavedReply[]>([]);
  const [awayOn, setAwayOn] = useState(false);
  const [awayMessage, setAwayMessage] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [days, setDays] = useState<number[]>([0, 6]);
  const [from, setFrom] = useState('18:00');
  const [to, setTo] = useState('09:00');
  const [editing, setEditing] = useState<Draft | null>(null);

  const apply = (s: InboxSettings) => {
    setLoaded(s);
    setReplies(s.saved_replies);
    setAwayOn(s.away.enabled);
    setAwayMessage(s.away.message);
    setScheduled(!!s.away.schedule);
    if (s.away.schedule) {
      setDays(s.away.schedule.days);
      setFrom(s.away.schedule.from);
      setTo(s.away.schedule.to);
    }
  };

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const s = await getInboxSettings();
      if (!s) setUnsupported(true);
      else apply(s);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Saves the away message (saved replies are saved on their own as you edit them). */
  const persist = async () => {
    let schedule: AwaySchedule | null = null;
    if (scheduled) {
      const f = normalizeTime(from);
      const t = normalizeTime(to);
      if (!f || !t) {
        void alertMessage('Check the times', 'Use 24-hour times like 18:00 and 09:00.');
        return;
      }
      if (days.length === 0) {
        void alertMessage('Pick at least one day', 'Choose the days your away message should run.');
        return;
      }
      schedule = { days, from: f, to: t };
    }
    if (awayOn && !awayMessage.trim()) {
      void alertMessage('Add an away message', 'Write what customers should see before turning it on.');
      return;
    }
    setSaving(true);
    try {
      apply(await saveInboxSettings({ away: { enabled: awayOn, message: awayMessage.trim(), schedule } }));
      toast.success(awayOn ? 'Away message is on' : 'Away message saved');
    } catch {
      void alertMessage('Couldn’t save', 'Your changes didn’t save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveReplies = async (next: SavedReply[]) => {
    setSaving(true);
    try {
      const s = await saveInboxSettings({
        saved_replies: next.map((r) => ({ id: r.id || undefined, title: r.title, body: r.body })),
      });
      setReplies(s.saved_replies);
      return true;
    } catch {
      void alertMessage('Couldn’t save', 'Your saved reply didn’t save. Try again.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    if (!editing) return;
    const title = editing.title.trim();
    const body = editing.body.trim();
    if (!title || !body) {
      void alertMessage('Almost there', 'Give the reply a short name and the text to insert.');
      return;
    }
    const next = editing.id
      ? replies.map((r) => (r.id === editing.id ? { ...r, title, body } : r))
      : [...replies, { id: '', title, body }];
    const ok = await saveReplies(next);
    if (ok) {
      setEditing(null);
      toast.success(editing.id ? 'Saved reply updated' : 'Saved reply added');
    }
  };

  const removeReply = async (r: SavedReply) => {
    const ok = await confirmAsync('Delete this saved reply?', `“${r.title}” will be removed.`, {
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    if (await saveReplies(replies.filter((x) => x.id !== r.id))) toast.info('Saved reply deleted');
  };

  if (unsupported) {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['bottom']}>
        <ErrorState
          icon="cloud-offline-outline"
          title="Not available yet"
          message="Saved replies and away messages arrive with the next server update."
        />
      </SafeAreaView>
    );
  }

  if (!loaded) {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['bottom']}>
        {failed ? (
          <ErrorState message="We couldn’t load your inbox settings." onRetry={() => void load()} />
        ) : (
          <View style={tw`px-gutter pt-4`}>
            <Skeleton style={tw`h-24 w-full rounded-card mb-3`} />
            <Skeleton style={tw`h-40 w-full rounded-card`} />
          </View>
        )}
      </SafeAreaView>
    );
  }

  const inputStyle = tw`bg-card border border-line/80 rounded-control px-3 py-2.5 text-body text-ink`;

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['bottom']}>
      <ScrollView {...verticalScrollProps} automaticallyAdjustKeyboardInsets contentContainerStyle={tw`pb-10`}>
        {/* Saved replies */}
        <View style={tw`px-gutter pt-4 pb-2`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-1`}>Saved replies</Text>
          <Text style={tw`text-footnote text-ink-3 leading-5 mb-3`}>
            Answers you send often — opening hours, shipping, sizing. Insert them from any chat with “Saved replies”.
          </Text>
          {replies.length === 0 ? (
            <View style={tw`bg-card border border-line/80 rounded-card px-4 py-4 mb-3`}>
              <Text style={tw`text-footnote text-ink-2`}>No saved replies yet.</Text>
            </View>
          ) : (
            <View style={tw`bg-card border border-line/80 rounded-card mb-3`}>
              {replies.map((r, i) => (
                <View
                  key={r.id}
                  style={tw`flex-row items-center px-4 py-3 ${i > 0 ? 'border-t border-line/60' : ''}`}
                >
                  <PressableScale
                    style={tw`flex-1 pr-3`}
                    onPress={() => setEditing({ id: r.id, title: r.title, body: r.body })}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit saved reply ${r.title}`}
                  >
                    <Text style={tw`text-body font-semibold text-ink`} numberOfLines={1}>
                      {r.title}
                    </Text>
                    <Text style={tw`text-footnote text-ink-3 mt-0.5`} numberOfLines={2}>
                      {r.body}
                    </Text>
                  </PressableScale>
                  <PressableScale
                    onPress={() => void removeReply(r)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete saved reply ${r.title}`}
                  >
                    <Ionicons name="trash-outline" size={18} color={theme.colors.iconMuted} />
                  </PressableScale>
                </View>
              ))}
            </View>
          )}
          {replies.length < SAVED_REPLIES_MAX ? (
            <PressableScale
              onPress={() => setEditing({ title: '', body: '' })}
              feedback="open"
              accessibilityRole="button"
              style={tw`flex-row items-center self-start px-3.5 py-2 rounded-chip bg-raised`}
            >
              <Ionicons name="add" size={16} color={theme.colors.ink2} />
              <Text style={tw`ml-1 text-footnote font-semibold text-ink-2`}>Add saved reply</Text>
            </PressableScale>
          ) : (
            <Text style={tw`text-caption text-ink-3`}>You’ve reached {SAVED_REPLIES_MAX} saved replies.</Text>
          )}
        </View>

        {/* Away message */}
        <View style={tw`px-gutter pt-6`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-1`}>Away message</Text>
          <Text style={tw`text-footnote text-ink-3 leading-5 mb-3`}>
            When a customer messages you while you’re away, they get this once — at most every 12 hours per chat.
          </Text>
          <View style={tw`bg-card border border-line/80 rounded-card px-4 py-3`}>
            <View style={tw`flex-row items-center justify-between`}>
              <Text style={tw`text-body text-ink`}>Send an away message</Text>
              <Switch
                accessibilityLabel="Send an away message"
                value={awayOn}
                onValueChange={(v) => {
                  toggleFeedback(v);
                  setAwayOn(v);
                }}
                trackColor={{ false: theme.colors.iconMuted, true: theme.colors.brand }}
                thumbColor="#FFFFFF"
              />
            </View>
            <TextInput
              {...formInputAccessoryProps({ multiline: true })}
              value={awayMessage}
              onChangeText={setAwayMessage}
              placeholder="Thanks for your message! We’re away right now and will reply in the morning."
              placeholderTextColor={theme.colors.placeholder}
              multiline
              maxLength={AWAY_MESSAGE_MAX}
              style={[inputStyle, tw`mt-3 min-h-[88px] max-h-40`]}
              textAlignVertical="top"
              accessibilityLabel="Away message"
            />
            <Text style={tw`text-caption text-ink-3 text-right mt-1`}>
              {awayMessage.trim().length}/{AWAY_MESSAGE_MAX}
            </Text>

            <View style={tw`flex-row items-center justify-between mt-2 pt-3 border-t border-line/60`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={tw`text-body text-ink`}>Only on a schedule</Text>
                <Text style={tw`text-caption text-ink-3 mt-0.5`}>
                  {scheduled ? 'Uses your account’s timezone.' : 'Off: the message runs whenever it’s on.'}
                </Text>
              </View>
              <Switch
                accessibilityLabel="Only on a schedule"
                value={scheduled}
                onValueChange={(v) => {
                  toggleFeedback(v);
                  setScheduled(v);
                }}
                trackColor={{ false: theme.colors.iconMuted, true: theme.colors.brand }}
                thumbColor="#FFFFFF"
              />
            </View>

            {scheduled ? (
              <View style={tw`mt-3`}>
                <View style={tw`flex-row flex-wrap`}>
                  {DAYS.map((label, d) => {
                    const on = days.includes(d);
                    return (
                      <PressableScale
                        key={label}
                        onPress={() =>
                          setDays((prev) => (on ? prev.filter((x) => x !== d) : [...prev, d].sort()))
                        }
                        feedback="chip"
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={tw`px-2.5 py-1.5 mr-1.5 mb-1.5 rounded-chip border ${
                          on ? 'bg-brand-600 border-brand-600' : 'bg-page border-line/80'
                        }`}
                      >
                        <Text style={tw`text-caption font-semibold ${on ? 'text-white' : 'text-ink-2'}`}>{label}</Text>
                      </PressableScale>
                    );
                  })}
                </View>
                <View style={tw`flex-row items-center mt-2`}>
                  <Text style={tw`text-footnote text-ink-2 mr-2`}>From</Text>
                  <TextInput
                    {...formInputAccessoryProps()}
                    value={from}
                    onChangeText={setFrom}
                    onBlur={() => setFrom((v) => normalizeTime(v) ?? v)}
                    placeholder="18:00"
                    placeholderTextColor={theme.colors.placeholder}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    style={[inputStyle, tw`w-20 text-center`]}
                    accessibilityLabel="Away from (24-hour time)"
                  />
                  <Text style={tw`text-footnote text-ink-2 mx-2`}>to</Text>
                  <TextInput
                    {...formInputAccessoryProps()}
                    value={to}
                    onChangeText={setTo}
                    onBlur={() => setTo((v) => normalizeTime(v) ?? v)}
                    placeholder="09:00"
                    placeholderTextColor={theme.colors.placeholder}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    style={[inputStyle, tw`w-20 text-center`]}
                    accessibilityLabel="Away until (24-hour time)"
                  />
                </View>
                <Text style={tw`text-caption text-ink-3 mt-2 leading-4`}>
                  An evening-to-morning window (like 18:00 to 09:00) runs overnight into the next day. Same start and
                  end = the whole day.
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={tw`px-gutter pt-6`}>
          <PrimaryButton
            label={saving ? 'Saving…' : 'Save away message'}
            onPress={() => void persist()}
            disabled={saving}
            loading={saving}
          />
        </View>
      </ScrollView>
      <KeyboardDoneAccessory />

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardInsetView style={tw`flex-1 justify-end bg-black/40`} contentStyle={tw`justify-end`}>
          <View style={tw`bg-page rounded-t-sheet px-gutter pt-4 pb-8`}>
            <View style={tw`flex-row items-center justify-between mb-3`}>
              <Text style={tw`text-title font-bold text-ink`}>
                {editing?.id ? 'Edit saved reply' : 'New saved reply'}
              </Text>
              <PressableScale
                onPress={() => setEditing(null)}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                style={tw`w-9 h-9 rounded-full bg-raised items-center justify-center`}
              >
                <Ionicons name="close" size={18} color={theme.colors.ink} />
              </PressableScale>
            </View>
            <TextInput
              value={editing?.title ?? ''}
              onChangeText={(t) => setEditing((d) => (d ? { ...d, title: t } : d))}
              placeholder="Name, e.g. Shipping times"
              placeholderTextColor={theme.colors.placeholder}
              maxLength={40}
              style={[inputStyle, tw`mb-3`]}
              accessibilityLabel="Saved reply name"
            />
            <TextInput
              value={editing?.body ?? ''}
              onChangeText={(t) => setEditing((d) => (d ? { ...d, body: t } : d))}
              placeholder="The text to insert into the chat"
              placeholderTextColor={theme.colors.placeholder}
              multiline
              maxLength={1000}
              style={[inputStyle, tw`min-h-[110px] max-h-56 mb-4`]}
              textAlignVertical="top"
              accessibilityLabel="Saved reply text"
            />
            <PressableScale
              onPress={() => void saveDraft()}
              disabled={saving}
              feedback="success"
              accessibilityRole="button"
              style={tw`py-3.5 rounded-control bg-brand-600 items-center ${saving ? 'opacity-60' : ''}`}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={tw`text-white font-bold`}>Save reply</Text>}
            </PressableScale>
          </View>
        </KeyboardInsetView>
      </Modal>
    </SafeAreaView>
  );
}
