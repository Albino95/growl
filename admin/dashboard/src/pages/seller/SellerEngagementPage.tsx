import { useCallback, useEffect, useState } from 'react';
import { EyeOff, MessageCircleQuestion, MessageSquareReply, Plus, Star, Trash2 } from 'lucide-react';
import {
  answerQuestion,
  errorMessage,
  getInboxSettings,
  hideQuestion,
  isFeatureUnavailable,
  listQuestions,
  listReviews,
  replyReview,
  saveInboxSettings,
  type BusinessQuestion,
  type BusinessReview,
  type InboxSettings,
  type SavedReply,
} from '../../services/api/sellerApi';
import { formatDate } from '../../lib/sellerFormat';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Switch, Textarea } from '../../components/ui/Input';
import { ConfirmDialog } from '../../components/ui/Dialog';
import {
  ComingSoonBlock,
  EmptyBlock,
  ErrorBlock,
  IconButton,
  InlineNotice,
  LoadingBlock,
  Segmented,
  useToast,
} from '../../components/seller/SellerUI';

type Tab = 'questions' | 'reviews' | 'inbox';
type Load = 'loading' | 'ready' | 'unavailable' | 'error';

const ANSWER_MAX = 600;
const SAVED_MAX = 20;
const AWAY_MAX = 300;
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function SellerEngagementPage() {
  const [tab, setTab] = useState<Tab>('questions');
  const [savedReplies, setSavedReplies] = useState<SavedReply[]>([]);

  useEffect(() => {
    getInboxSettings()
      .then((s) => setSavedReplies(s.saved_replies || []))
      .catch(() => undefined);
  }, [tab]);

  return (
    <div>
      <PageHeader
        title="Questions & reviews"
        subtitle="Answer what people ask about your products and thank them for reviews. Answers show publicly in the app."
        action={
          <Segmented
            label="Section"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'questions', label: 'Questions' },
              { value: 'reviews', label: 'Reviews' },
              { value: 'inbox', label: 'Inbox settings' },
            ]}
          />
        }
      />
      {tab === 'questions' && <QuestionsTab savedReplies={savedReplies} />}
      {tab === 'reviews' && <ReviewsTab savedReplies={savedReplies} />}
      {tab === 'inbox' && <InboxTab onSaved={(s) => setSavedReplies(s.saved_replies)} />}
    </div>
  );
}

function SavedReplyPicker({ replies, onPick }: { replies: SavedReply[]; onPick: (body: string) => void }) {
  if (!replies.length) return null;
  return (
    <select
      aria-label="Insert a saved reply"
      className="focus-ring rounded-lg border border-surface-border bg-surface px-2 py-1.5 text-xs text-stone-700"
      value=""
      onChange={(e) => {
        const r = replies.find((x) => (x.id || x.title) === e.target.value);
        if (r) onPick(r.body);
      }}
    >
      <option value="">Insert saved reply…</option>
      {replies.map((r) => (
        <option key={r.id || r.title} value={r.id || r.title}>
          {r.title}
        </option>
      ))}
    </select>
  );
}

function ReplyBox({
  initial,
  placeholder,
  submitLabel,
  savedReplies,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  placeholder: string;
  submitLabel: string;
  savedReplies: SavedReply[];
  onSubmit: (text: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial || '');
  const [busy, setBusy] = useState(false);
  const tooLong = text.length > ANSWER_MAX;
  return (
    <div className="mt-3">
      <Textarea
        aria-label={placeholder}
        rows={3}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <SavedReplyPicker replies={savedReplies} onPick={(b) => setText((t) => (t ? `${t}\n${b}` : b))} />
        <span className={`ml-auto text-xs ${tooLong ? 'text-red-600' : 'text-stone-400'}`}>
          {text.length}/{ANSWER_MAX}
        </span>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button
          loading={busy}
          disabled={!text.trim() || tooLong}
          onClick={async () => {
            setBusy(true);
            try {
              await onSubmit(text.trim());
              setText('');
            } finally {
              setBusy(false);
            }
          }}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function ProductChip({ product }: { product: BusinessQuestion['product'] }) {
  if (!product) return null;
  return (
    <span className="inline-flex items-center gap-2 text-xs text-stone-500">
      {product.image_url && <img src={product.image_url} alt="" className="h-5 w-5 rounded object-cover" />}
      {product.name}
    </span>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return url ? (
    <img src={url} alt="" className="h-8 w-8 rounded-full object-cover" />
  ) : (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700" aria-hidden>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function QuestionsTab({ savedReplies }: { savedReplies: SavedReply[] }) {
  const toast = useToast();
  const [filter, setFilter] = useState<'unanswered' | 'all'>('unanswered');
  const [items, setItems] = useState<BusinessQuestion[]>([]);
  const [state, setState] = useState<Load>('loading');
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [hideTarget, setHideTarget] = useState<BusinessQuestion | null>(null);
  const [hiding, setHiding] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      setItems(await listQuestions(filter));
      setState('ready');
    } catch (e) {
      if (isFeatureUnavailable(e)) setState('unavailable');
      else {
        setErr(errorMessage(e, 'Failed to load questions'));
        setState('error');
      }
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function answer(q: BusinessQuestion, text: string) {
    try {
      await answerQuestion(q.id, text);
      toast('Answer posted');
      setEditing(null);
      if (filter === 'unanswered') setItems((list) => list.filter((x) => x.id !== q.id));
      else setItems((list) => list.map((x) => (x.id === q.id ? { ...x, answer: { body: text, answered_at: new Date().toISOString() } } : x)));
    } catch (e) {
      toast(errorMessage(e, 'Could not post the answer'), 'error');
      throw e;
    }
  }

  async function hide() {
    if (!hideTarget) return;
    setHiding(true);
    try {
      await hideQuestion(hideTarget.id);
      setItems((list) => list.filter((x) => x.id !== hideTarget.id));
      toast('Question hidden');
      setHideTarget(null);
    } catch (e) {
      toast(errorMessage(e, 'Could not hide the question'), 'error');
    } finally {
      setHiding(false);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <Segmented
          label="Show questions"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'unanswered', label: 'Waiting for you' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      {state === 'loading' ? (
        <Card className="!p-0">
          <LoadingBlock rows={3} />
        </Card>
      ) : state === 'unavailable' ? (
        <Card>
          <ComingSoonBlock feature="Product questions" />
        </Card>
      ) : state === 'error' ? (
        <Card>
          <ErrorBlock message={err} onRetry={() => void load()} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyBlock
            icon={MessageCircleQuestion}
            title={filter === 'unanswered' ? 'You’re all caught up' : 'No questions yet'}
            description="When someone asks about a product in the app, it shows up here."
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((q) => (
            <li key={q.id}>
              <Card padding="md">
                <div className="flex items-start gap-3">
                  <Avatar name={q.asker.name} url={q.asker.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-semibold">{q.asker.name}</span>
                      <span className="text-xs text-stone-500">{formatDate(q.created_at, true)}</span>
                      <ProductChip product={q.product} />
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm text-stone-800">{q.body}</p>
                    {q.answer && editing !== q.id ? (
                      <div className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-sm">
                        <p className="text-xs font-semibold text-brand-700">Your answer · {formatDate(q.answer.answered_at)}</p>
                        <p className="mt-0.5 whitespace-pre-line text-stone-800">{q.answer.body}</p>
                        <button type="button" className="focus-ring mt-1 rounded text-xs font-medium text-brand-700 hover:underline" onClick={() => setEditing(q.id)}>
                          Edit answer
                        </button>
                      </div>
                    ) : (
                      <ReplyBox
                        key={editing === q.id ? 'edit' : 'new'}
                        initial={q.answer?.body}
                        placeholder="Write a public answer…"
                        submitLabel={q.answer ? 'Update answer' : 'Post answer'}
                        savedReplies={savedReplies}
                        onCancel={q.answer ? () => setEditing(null) : undefined}
                        onSubmit={(t) => answer(q, t)}
                      />
                    )}
                  </div>
                  <IconButton label="Hide this question" icon={EyeOff} onClick={() => setHideTarget(q)} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!hideTarget}
        title="Hide this question?"
        message="It won’t show on your product anymore. Use this for spam or questions that don’t belong — to report abuse, use the app."
        confirmLabel="Hide"
        loading={hiding}
        onCancel={() => setHideTarget(null)}
        onConfirm={() => void hide()}
      />
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= rating ? 'fill-amber-400 text-amber-400' : 'text-stone-300'}`} aria-hidden />
      ))}
    </span>
  );
}

function ReviewsTab({ savedReplies }: { savedReplies: SavedReply[] }) {
  const toast = useToast();
  const [filter, setFilter] = useState<'unreplied' | 'all'>('unreplied');
  const [items, setItems] = useState<BusinessReview[]>([]);
  const [state, setState] = useState<Load>('loading');
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      setItems(await listReviews(filter));
      setState('ready');
    } catch (e) {
      if (isFeatureUnavailable(e)) setState('unavailable');
      else {
        setErr(errorMessage(e, 'Failed to load reviews'));
        setState('error');
      }
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reply(r: BusinessReview, text: string) {
    try {
      await replyReview(r.id, text);
      toast(r.reply ? 'Reply updated' : 'Reply posted');
      setEditing(null);
      if (filter === 'unreplied') setItems((list) => list.filter((x) => x.id !== r.id));
      else setItems((list) => list.map((x) => (x.id === r.id ? { ...x, reply: { body: text, replied_at: new Date().toISOString() } } : x)));
    } catch (e) {
      toast(errorMessage(e, 'Could not post the reply'), 'error');
      throw e;
    }
  }

  return (
    <div>
      <div className="mb-4">
        <Segmented
          label="Show reviews"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'unreplied', label: 'Waiting for a reply' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      {state === 'loading' ? (
        <Card className="!p-0">
          <LoadingBlock rows={3} />
        </Card>
      ) : state === 'unavailable' ? (
        <Card>
          <ComingSoonBlock feature="Product reviews" />
        </Card>
      ) : state === 'error' ? (
        <Card>
          <ErrorBlock message={err} onRetry={() => void load()} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyBlock
            icon={Star}
            title={filter === 'unreplied' ? 'Nothing waiting' : 'No reviews yet'}
            description="Only people who received an order can review, so reviews start once checkout opens."
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id}>
              <Card padding="md">
                <div className="flex items-start gap-3">
                  <Avatar name={r.author.name} url={r.author.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-semibold">{r.author.name}</span>
                      <Stars rating={r.rating} />
                      {r.verified_purchase && <span className="text-xs font-medium text-emerald-700">Verified purchase</span>}
                      <span className="text-xs text-stone-500">{formatDate(r.created_at)}</span>
                      <ProductChip product={r.product} />
                    </div>
                    {r.body && <p className="mt-1 whitespace-pre-line text-sm text-stone-800">{r.body}</p>}
                    {r.reply && editing !== r.id ? (
                      <div className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-sm">
                        <p className="text-xs font-semibold text-brand-700">Your reply · {formatDate(r.reply.replied_at)}</p>
                        <p className="mt-0.5 whitespace-pre-line text-stone-800">{r.reply.body}</p>
                        <button type="button" className="focus-ring mt-1 rounded text-xs font-medium text-brand-700 hover:underline" onClick={() => setEditing(r.id)}>
                          Edit reply
                        </button>
                      </div>
                    ) : (
                      <ReplyBox
                        key={editing === r.id ? 'edit' : 'new'}
                        initial={r.reply?.body}
                        placeholder="Write a public reply…"
                        submitLabel={r.reply ? 'Update reply' : 'Post reply'}
                        savedReplies={savedReplies}
                        onCancel={r.reply ? () => setEditing(null) : undefined}
                        onSubmit={(t) => reply(r, t)}
                      />
                    )}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InboxTab({ onSaved }: { onSaved: (s: InboxSettings) => void }) {
  const toast = useToast();
  const [settings, setSettings] = useState<InboxSettings | null>(null);
  const [state, setState] = useState<Load>('loading');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [useSchedule, setUseSchedule] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const s = await getInboxSettings();
      setSettings({
        saved_replies: s.saved_replies || [],
        away: s.away || { enabled: false, message: '', schedule: null },
      });
      setUseSchedule(!!s.away?.schedule);
      setState('ready');
    } catch (e) {
      if (isFeatureUnavailable(e)) setState('unavailable');
      else {
        setErr(errorMessage(e, 'Failed to load inbox settings'));
        setState('error');
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === 'loading')
    return (
      <Card className="!p-0">
        <LoadingBlock rows={3} />
      </Card>
    );
  if (state === 'unavailable')
    return (
      <Card>
        <ComingSoonBlock feature="Inbox settings" />
      </Card>
    );
  if (state === 'error' || !settings)
    return (
      <Card>
        <ErrorBlock message={err} onRetry={() => void load()} />
      </Card>
    );

  const s = settings;
  const schedule = s.away.schedule || { days: [1, 2, 3, 4, 5], from: '18:00', to: '09:00' };
  const replyErrors = s.saved_replies.map((r) =>
    !r.title.trim() ? 'Add a title' : r.title.length > 40 ? 'Title: 40 characters max' : !r.body.trim() ? 'Add the reply text' : r.body.length > 1000 ? 'Reply: 1000 characters max' : ''
  );
  const awayError =
    s.away.message.length > AWAY_MAX
      ? `Keep it under ${AWAY_MAX} characters`
      : s.away.enabled && !s.away.message.trim()
        ? 'Write a message before turning this on'
        : useSchedule && schedule.days.length === 0
          ? 'Pick at least one day'
          : '';
  const invalid = replyErrors.some(Boolean) || !!awayError;

  function setReply(i: number, patch: Partial<SavedReply>) {
    setSettings((cur) => cur && { ...cur, saved_replies: cur.saved_replies.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  }

  async function save() {
    setSaving(true);
    try {
      const next = await saveInboxSettings({
        saved_replies: s.saved_replies.map((r) => ({ ...(r.id ? { id: r.id } : {}), title: r.title.trim(), body: r.body.trim() })),
        away: {
          enabled: s.away.enabled,
          message: s.away.message.trim(),
          schedule: useSchedule ? schedule : null,
        },
      });
      setSettings(next);
      onSaved(next);
      toast('Inbox settings saved');
    } catch (e) {
      toast(errorMessage(e, 'Save failed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card padding="lg">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-semibold text-stone-900">Saved replies</h2>
          <span className="text-xs text-stone-500">
            {s.saved_replies.length}/{SAVED_MAX}
          </span>
        </div>
        <p className="mb-4 text-sm text-stone-500">Reuse answers for common questions — here, in messages and in the app.</p>
        {s.saved_replies.length === 0 && <p className="mb-3 text-sm text-stone-400">No saved replies yet.</p>}
        <ul className="space-y-4">
          {s.saved_replies.map((r, i) => (
            <li key={r.id || `new-${i}`} className="rounded-xl border border-surface-border p-3">
              <div className="flex items-center gap-2">
                <Input aria-label={`Saved reply ${i + 1} title`} value={r.title} maxLength={40} placeholder="Title, e.g. Shipping times" onChange={(e) => setReply(i, { title: e.target.value })} />
                <IconButton
                  label={`Delete saved reply ${r.title || i + 1}`}
                  icon={Trash2}
                  tone="danger"
                  onClick={() => setSettings((cur) => cur && { ...cur, saved_replies: cur.saved_replies.filter((_, j) => j !== i) })}
                />
              </div>
              <Textarea aria-label={`Saved reply ${i + 1} text`} className="mt-2" rows={3} value={r.body} maxLength={1000} onChange={(e) => setReply(i, { body: e.target.value })} />
              {replyErrors[i] && <p className="mt-1 text-xs text-red-600">{replyErrors[i]}</p>}
            </li>
          ))}
        </ul>
        {s.saved_replies.length < SAVED_MAX && (
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => setSettings((cur) => cur && { ...cur, saved_replies: [...cur.saved_replies, { title: '', body: '' }] })}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add saved reply
          </Button>
        )}
      </Card>

      <Card padding="lg">
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-stone-900">
          <MessageSquareReply className="h-4 w-4 text-brand-600" aria-hidden /> Away message
        </h2>
        <p className="mb-4 text-sm text-stone-500">
          When you’re away, a customer’s first message gets one automatic reply (at most once every 12 hours per conversation).
        </p>
        <Switch
          checked={s.away.enabled}
          onChange={(v) => setSettings((cur) => cur && { ...cur, away: { ...cur.away, enabled: v } })}
          label={s.away.enabled ? 'On' : 'Off'}
        />
        <div className="mt-4">
          <Field label="Message">
            <Textarea
              rows={3}
              value={s.away.message}
              placeholder="Thanks for your message! We’re away right now and will reply within a day."
              onChange={(e) => setSettings((cur) => cur && { ...cur, away: { ...cur.away, message: e.target.value } })}
            />
            <p className={`mt-1 text-right text-xs ${s.away.message.length > AWAY_MAX ? 'text-red-600' : 'text-stone-400'}`}>
              {s.away.message.length}/{AWAY_MAX}
            </p>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={useSchedule} onChange={(e) => setUseSchedule(e.target.checked)} />
          Only on a schedule (otherwise whenever it’s on)
        </label>
        {useSchedule && (
          <div className="mt-3 rounded-xl bg-surface-page p-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Away days">
              {DAY_SHORT.map((d, i) => {
                const on = schedule.days.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setSettings((cur) =>
                        cur && {
                          ...cur,
                          away: { ...cur.away, schedule: { ...schedule, days: on ? schedule.days.filter((x) => x !== i) : [...schedule.days, i].sort() } },
                        }
                      )
                    }
                    className={`focus-ring rounded-full px-3 py-1 text-xs font-medium ${on ? 'bg-brand-600 text-white' : 'bg-white text-stone-600 ring-1 ring-surface-border'}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span>From</span>
              <Input
                type="time"
                aria-label="Away from"
                className="!w-32"
                value={schedule.from}
                onChange={(e) => setSettings((cur) => cur && { ...cur, away: { ...cur.away, schedule: { ...schedule, from: e.target.value } } })}
              />
              <span>to</span>
              <Input
                type="time"
                aria-label="Away until"
                className="!w-32"
                value={schedule.to}
                onChange={(e) => setSettings((cur) => cur && { ...cur, away: { ...cur.away, schedule: { ...schedule, to: e.target.value } } })}
              />
            </div>
            <p className="mt-2 text-xs text-stone-500">Times past midnight work too (e.g. 18:00 to 09:00).</p>
          </div>
        )}
        {awayError && (
          <div className="mt-3">
            <InlineNotice tone="warn">{awayError}</InlineNotice>
          </div>
        )}
      </Card>

      <div className="lg:col-span-2">
        <Button loading={saving} disabled={invalid} onClick={() => void save()}>
          Save inbox settings
        </Button>
      </div>
    </div>
  );
}
