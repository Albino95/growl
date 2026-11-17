import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import GrowAvatar from '../ui/GrowAvatar';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet';
import PrimaryButton from '../ui/PrimaryButton';
import { SkeletonList } from '../ui/SkeletonCard';
import ProofMedia from '../proof/ProofMedia';
import ProofSheet from '../proof/ProofSheet';
import { KIND_META, proofSummary } from '../proof/proofDefaults';
import {
  completeCohortHomework,
  deleteCohortHomework,
  getCohortHomework,
  markCohortHomeworkSeen,
  type CoachHomework,
  type Cohort,
  type CohortCell,
  type CohortHomeworkStatus,
  type CohortUser,
  type MemberHomework,
} from '../../services/api/cohorts';
import type { Proof } from '../../services/api/proofs';
import { ApiError } from '../../services/api/http';
import { useRefresh } from '../../hooks/useRefresh';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { toast } from '../../state/useToastStore';
import { haptic } from '../../theme/haptics';
import CohortAssignSheet from './CohortAssignSheet';
import { formatDay, homeworkStatusLabel, personName } from './cohortCopy';

type Props = { cohort: Cohort };

const GRID_COLUMNS = 6;
const CELL = 40;

function Bar({ pct }: { pct: number }) {
  return (
    <View style={tw`h-1.5 rounded-full bg-raised overflow-hidden`}>
      <View style={[tw`h-1.5 rounded-full bg-emerald-600`, { width: `${Math.max(0, Math.min(100, pct))}%` }]} />
    </View>
  );
}

function StatusDot({ status }: { status: CohortHomeworkStatus }) {
  if (status === 'done') return <Ionicons name="checkmark-circle" size={22} color={theme.colors.brand} />;
  if (status === 'partly') return <Ionicons name="contrast-outline" size={20} color={tw.color('amber-600')} />;
  return <View style={tw`w-2 h-2 rounded-full bg-line`} />;
}

// ---------------------------------------------------------------------------
// Coach

function ProofViewerSheet({
  cell,
  member,
  title,
  onClose,
  onSeen,
}: {
  cell: CohortCell | null;
  member: CohortUser | undefined;
  title: string;
  onClose: () => void;
  onSeen: (cell: CohortCell) => void;
}) {
  const proof = cell?.proof ?? null;
  return (
    <AnimatedBottomSheet visible={!!cell} onClose={onClose} maxHeightRatio={0.85}>
      {cell ? (
        <View style={tw`px-gutter pt-1 pb-8`}>
          <View style={tw`flex-row items-center`}>
            <GrowAvatar userId={member?.id} username={member?.username} uri={member?.avatar_url} size={32} />
            <View style={tw`flex-1 ml-2.5`}>
              <Text style={tw`text-callout font-semibold text-ink`}>{personName(member)}</Text>
              <Text style={tw`text-footnote text-ink-3`} numberOfLines={1}>
                {title} · {homeworkStatusLabel(cell.status)}
              </Text>
            </View>
          </View>
          {proof ? (
            <>
              {proof.media_url ? (
                <ProofMedia
                  proof={proof}
                  style={tw`w-full h-72 rounded-card mt-4`}
                  contentFit="contain"
                  accessibilityLabel={`Proof from ${personName(member)}`}
                />
              ) : null}
              <Text style={tw`text-body text-ink mt-3`}>
                {KIND_META[proof.kind]?.emoji} {proofSummary(proof)}
              </Text>
            </>
          ) : (
            <Text style={tw`text-body text-ink-2 mt-4`}>Finished without proof — that counts too.</Text>
          )}
          {cell.status !== 'assigned' ? (
            cell.seen_at ? (
              <View style={tw`mt-5 flex-row items-center justify-center`}>
                <Ionicons name="checkmark-done" size={18} color={theme.colors.brand} />
                <Text style={tw`ml-1.5 text-footnote font-semibold text-emerald-700`}>Seen</Text>
              </View>
            ) : (
              <PrimaryButton label="Seen ✓" onPress={() => onSeen(cell)} style={tw`mt-5`} />
            )
          ) : null}
        </View>
      ) : null}
    </AnimatedBottomSheet>
  );
}

function CoachView({ cohort, data, reload }: { cohort: Cohort; data: CoachHomework; reload: () => Promise<void> }) {
  const [assign, setAssign] = useState(false);
  const [open, setOpen] = useState<CohortCell | null>(null);
  const [cells, setCells] = useState(data.cells);
  useEffect(() => setCells(data.cells), [data.cells]);

  const byKey = useMemo(() => {
    const m = new Map<string, CohortCell>();
    for (const c of cells) m.set(`${c.assignment_id}:${c.user_id}`, c);
    return m;
  }, [cells]);
  const members = useMemo(() => new Map(data.members.map((u) => [u.id, u])), [data.members]);
  const columns = data.assignments.slice(0, GRID_COLUMNS);

  const unseenFor = (assignmentId: string) =>
    cells.filter((c) => c.assignment_id === assignmentId && c.status !== 'assigned' && !c.seen_at).length;

  const markSeen = async (input: { assignment_id?: string; member_assignment_ids?: string[] }) => {
    const ids = new Set(input.member_assignment_ids ?? []);
    const stamp = new Date().toISOString();
    const hit = (c: CohortCell) =>
      c.status !== 'assigned' && !c.seen_at && (ids.has(c.id) || c.assignment_id === input.assignment_id);
    setCells((list) => list.map((c) => (hit(c) ? { ...c, seen_at: stamp } : c)));
    try {
      const n = await markCohortHomeworkSeen(cohort.id, input);
      haptic('success');
      if (n > 1) toast.success(`${n} marked as seen`);
    } catch {
      toast.info('Couldn’t mark as seen just now');
      void reload();
    }
  };

  const remove = async (id: string, title: string) => {
    const ok = await confirmAsync(`Remove “${title}”?`, 'It disappears for every member, with their progress on it.', {
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteCohortHomework(cohort.id, id);
      void reload();
    } catch (e) {
      void alertMessage('Couldn’t remove it', e instanceof ApiError ? e.message : undefined);
    }
  };

  const openCell = open;
  const openTitle = openCell ? data.assignments.find((a) => a.id === openCell.assignment_id)?.title ?? '' : '';

  return (
    <>
      {cohort.status === 'active' ? (
        <PressableScale
          feedback="open"
          onPress={() => setAssign(true)}
          accessibilityRole="button"
          accessibilityLabel="Assign homework to the group"
          style={tw`flex-row items-center justify-center bg-emerald-600 rounded-control py-3`}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={tw`ml-1.5 text-body font-semibold text-white`}>Assign homework to everyone</Text>
        </PressableScale>
      ) : null}

      {data.assignments.length === 0 ? (
        <EmptyState
          icon="clipboard-outline"
          title="No group homework yet"
          description="Assign one task and every member gets their own copy. You’ll see who finished — they only see their own."
        />
      ) : (
        <>
          {data.assignments.map((a) => {
            const unseen = unseenFor(a.id);
            return (
              <View key={a.id} style={tw`bg-card border border-line rounded-card px-4 py-3.5`}>
                <View style={tw`flex-row items-start`}>
                  <View style={tw`flex-1`}>
                    <Text style={tw`text-body font-semibold text-ink`}>{a.title}</Text>
                    <Text style={tw`text-footnote text-ink-3 mt-0.5`}>
                      {a.due_at ? `Due ${formatDay(a.due_at)}` : 'No due date'}
                      {a.proof_kind ? ` · ${KIND_META[a.proof_kind].emoji} ${KIND_META[a.proof_kind].label}` : ''}
                    </Text>
                  </View>
                  <PressableScale
                    onPress={() => void remove(a.id, a.title)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${a.title}`}
                    style={tw`p-1`}
                  >
                    <Ionicons name="trash-outline" size={17} color={theme.colors.iconMuted} />
                  </PressableScale>
                </View>
                <View style={tw`mt-3`}>
                  <Bar pct={a.completion_pct} />
                </View>
                <View style={tw`flex-row items-center mt-2`}>
                  <Text style={tw`flex-1 text-footnote text-ink-2`}>
                    {a.done} done{a.partly ? ` · ${a.partly} partly` : ''} of {a.total}
                  </Text>
                  {unseen ? (
                    <PressableScale
                      feedback="commit"
                      onPress={() => void markSeen({ assignment_id: a.id })}
                      accessibilityRole="button"
                      accessibilityLabel={`Mark ${unseen} as seen`}
                      style={tw`px-3 py-1.5 rounded-chip bg-emerald-50`}
                    >
                      <Text style={tw`text-footnote font-semibold text-emerald-700`}>Seen all ({unseen})</Text>
                    </PressableScale>
                  ) : null}
                </View>
              </View>
            );
          })}

          {data.members.length ? (
            <View style={tw`bg-card border border-line rounded-card py-3`}>
              <Text style={tw`px-4 text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
                Who did what
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={tw`px-4`}>
                  <View style={tw`flex-row items-end mb-1`}>
                    <View style={tw`w-32`} />
                    {columns.map((a) => (
                      <Text
                        key={a.id}
                        numberOfLines={2}
                        style={[tw`text-caption text-ink-3 text-center`, { width: CELL + 16 }]}
                      >
                        {a.title}
                      </Text>
                    ))}
                  </View>
                  {data.members.map((u) => (
                    <View key={u.id} style={tw`flex-row items-center py-1 border-t border-line`}>
                      <View style={tw`w-32 flex-row items-center pr-2`}>
                        <GrowAvatar userId={u.id} username={u.username} uri={u.avatar_url} size={24} />
                        <Text style={tw`ml-2 text-footnote text-ink flex-1`} numberOfLines={1}>
                          {personName(u)}
                        </Text>
                      </View>
                      {columns.map((a) => {
                        const c = byKey.get(`${a.id}:${u.id}`);
                        return (
                          <View key={a.id} style={[tw`items-center justify-center`, { width: CELL + 16, height: CELL }]}>
                            {!c ? (
                              <Text style={tw`text-caption text-ink-3`}>—</Text>
                            ) : (
                              <PressableScale
                                disabled={c.status === 'assigned'}
                                onPress={() => setOpen(c)}
                                accessibilityRole="button"
                                accessibilityLabel={`${personName(u)}, ${a.title}: ${homeworkStatusLabel(c.status)}${
                                  c.proof ? ', with proof' : ''
                                }${c.seen_at ? ', seen' : ''}`}
                                style={tw`items-center justify-center`}
                              >
                                {c.proof?.media_url && c.proof.kind === 'photo' ? (
                                  <View>
                                    <ProofMedia proof={c.proof} style={{ width: CELL - 4, height: CELL - 4, borderRadius: 8 }} />
                                    {c.seen_at ? (
                                      <View style={tw`absolute -right-1 -bottom-1 bg-card rounded-full`}>
                                        <Ionicons name="checkmark-circle" size={14} color={theme.colors.brand} />
                                      </View>
                                    ) : null}
                                  </View>
                                ) : c.proof ? (
                                  <View
                                    style={tw`w-9 h-9 rounded-control items-center justify-center ${
                                      c.seen_at ? 'bg-emerald-50' : 'bg-raised'
                                    }`}
                                  >
                                    <Text style={tw`text-footnote`}>{KIND_META[c.proof.kind]?.emoji ?? '✓'}</Text>
                                  </View>
                                ) : (
                                  <StatusDot status={c.status} />
                                )}
                              </PressableScale>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>
              {data.assignments.length > GRID_COLUMNS ? (
                <Text style={tw`px-4 mt-2 text-caption text-ink-3`}>Showing the latest {GRID_COLUMNS} assignments.</Text>
              ) : null}
            </View>
          ) : null}
        </>
      )}

      <CohortAssignSheet
        visible={assign}
        onClose={() => setAssign(false)}
        cohortId={cohort.id}
        memberCount={cohort.member_count}
        onAssigned={(n) => {
          setAssign(false);
          toast.success(n === 1 ? 'Sent to 1 member' : `Sent to ${n} members`);
          void reload();
        }}
      />
      <ProofViewerSheet
        cell={open}
        member={open ? members.get(open.user_id) : undefined}
        title={openTitle}
        onClose={() => setOpen(null)}
        onSeen={(c) => {
          setOpen(null);
          void markSeen({ member_assignment_ids: [c.id] });
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Member

function MemberView({ cohort, data, setData }: { cohort: Cohort; data: MemberHomework; setData: (d: MemberHomework) => void }) {
  const [proofFor, setProofFor] = useState<MemberHomework['assignments'][number] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const update = async (
    a: MemberHomework['assignments'][number],
    status: CohortHomeworkStatus,
    proof?: Proof | null
  ) => {
    setBusy(a.mine.id);
    try {
      const mine = await completeCohortHomework(cohort.id, {
        member_assignment_id: a.mine.id,
        status,
        proof_id: proof?.id ?? null,
        proof_kind: proof?.kind ?? null,
      });
      if (status !== 'assigned') haptic('success');
      setData({ ...data, assignments: data.assignments.map((x) => (x.id === a.id ? { ...x, mine } : x)) });
      if (status === 'done') toast.success(proof ? 'Done — with proof' : 'Done');
      if (status === 'partly') toast.success('Partly counts');
    } catch (e) {
      void alertMessage('Couldn’t save that', e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  if (!data.assignments.length) {
    return (
      <EmptyState
        icon="clipboard-outline"
        title="No homework yet"
        description="When your coach assigns something to the group, it shows up here."
      />
    );
  }

  return (
    <>
      <View style={tw`flex-row items-center px-1`}>
        <Ionicons name="lock-closed-outline" size={13} color={theme.colors.ink3} />
        <Text style={tw`ml-1.5 text-footnote text-ink-3 flex-1`}>
          Only you and your coach see your homework. The group sees a total.
        </Text>
      </View>
      {data.assignments.map((a) => {
        const done = a.mine.status !== 'assigned';
        const isBusy = busy === a.mine.id;
        return (
          <View key={a.id} style={tw`bg-card border ${done ? 'border-emerald-100' : 'border-line'} rounded-card px-4 py-3.5`}>
            <View style={tw`flex-row items-start`}>
              <View style={tw`mt-0.5 mr-2.5`}>
                <StatusDot status={a.mine.status} />
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`text-body font-semibold text-ink`}>{a.title}</Text>
                {a.description ? <Text style={tw`text-footnote text-ink-2 mt-1 leading-5`}>{a.description}</Text> : null}
                <Text style={tw`text-footnote text-ink-3 mt-1`}>
                  {a.due_at ? `Due ${formatDay(a.due_at)}` : 'Whenever suits you'}
                  {a.proof_kind ? ` · coach asks for ${KIND_META[a.proof_kind].label.toLowerCase()}` : ''}
                </Text>
              </View>
            </View>
            <View style={tw`mt-3`}>
              <Bar pct={a.completion_pct} />
              <Text style={tw`text-caption text-ink-3 mt-1`}>{a.completion_pct}% of the group finished</Text>
            </View>
            {done ? (
              <View style={tw`flex-row items-center mt-3`}>
                <Text style={tw`flex-1 text-footnote font-semibold text-emerald-700`}>
                  {homeworkStatusLabel(a.mine.status)}
                  {a.mine.proof_id ? ' · with proof' : ''}
                  {a.mine.seen_at ? ' · seen by coach ✓' : ''}
                </Text>
                <PressableScale
                  disabled={isBusy}
                  onPress={() => void update(a, 'assigned')}
                  accessibilityRole="button"
                  accessibilityLabel={`Undo ${a.title}`}
                  style={tw`px-3 py-1.5`}
                >
                  <Text style={tw`text-footnote text-ink-3`}>Undo</Text>
                </PressableScale>
              </View>
            ) : cohort.status === 'active' ? (
              <View style={tw`flex-row gap-2 mt-3`}>
                <PressableScale
                  feedback="commit"
                  disabled={isBusy}
                  onPress={() => (a.proof_kind ? setProofFor(a) : void update(a, 'done'))}
                  accessibilityRole="button"
                  accessibilityLabel={a.proof_kind ? `Finish ${a.title} with proof` : `Mark ${a.title} done`}
                  style={tw`flex-1 py-2.5 rounded-control bg-emerald-600 items-center ${isBusy ? 'opacity-60' : ''}`}
                >
                  <Text style={tw`text-footnote font-semibold text-white`}>
                    {a.proof_kind ? `${KIND_META[a.proof_kind].emoji} Add proof` : 'Done'}
                  </Text>
                </PressableScale>
                {a.proof_kind ? (
                  <PressableScale
                    feedback="commit"
                    disabled={isBusy}
                    onPress={() => void update(a, 'done')}
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${a.title} done without proof`}
                    style={tw`px-4 py-2.5 rounded-control bg-raised items-center`}
                  >
                    <Text style={tw`text-footnote font-semibold text-ink`}>Done</Text>
                  </PressableScale>
                ) : (
                  <PressableScale
                    feedback={false}
                    disabled={isBusy}
                    onPress={() => setProofFor(a)}
                    accessibilityRole="button"
                    accessibilityLabel={`Finish ${a.title} with proof`}
                    style={tw`px-4 py-2.5 rounded-control bg-raised items-center`}
                  >
                    <Text style={tw`text-footnote font-semibold text-ink`}>+ Proof</Text>
                  </PressableScale>
                )}
                <PressableScale
                  feedback="commit"
                  disabled={isBusy}
                  onPress={() => void update(a, 'partly')}
                  accessibilityRole="button"
                  accessibilityLabel={`${a.title}: partly`}
                  style={tw`px-4 py-2.5 rounded-control bg-raised items-center`}
                >
                  <Text style={tw`text-footnote font-semibold text-ink`}>Partly</Text>
                </PressableScale>
              </View>
            ) : null}
          </View>
        );
      })}
      <ProofSheet
        visible={!!proofFor}
        onClose={() => setProofFor(null)}
        path={cohort.path}
        requestedKind={proofFor?.proof_kind ?? undefined}
        context={{ type: 'assignment', id: proofFor?.mine.id ?? '' }}
        shareWithCoachDefault
        title={proofFor?.title}
        onSaved={(p) => {
          const a = proofFor;
          setProofFor(null);
          if (a) void update(a, 'done', p);
        }}
      />
    </>
  );
}

/** Group homework: coach grid (members × assignments) or the member's own list. */
export default function CohortHomeworkTab({ cohort }: Props) {
  const [data, setData] = useState<CoachHomework | MemberHomework | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getCohortHomework(cohort.id));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [cohort.id]);
  useEffect(() => {
    void load();
  }, [load]);
  const refresh = useRefresh(load);

  return (
    <ScrollView contentContainerStyle={tw`px-gutter pt-3 pb-16 gap-3`} refreshControl={<RefreshControl {...refresh} />}>
      {!data && !failed ? (
        <SkeletonList variant="inbox" count={3} />
      ) : !data ? (
        <ErrorState compact title="Homework is still loading" message="We couldn’t reach it just now." onRetry={() => void load()} />
      ) : data.role === 'coach' ? (
        <CoachView cohort={cohort} data={data} reload={load} />
      ) : (
        <MemberView cohort={cohort} data={data} setData={setData} />
      )}
    </ScrollView>
  );
}
