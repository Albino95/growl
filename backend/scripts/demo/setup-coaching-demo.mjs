// Prepares demo data so every coaching/proof/group feature is testable:
// an active plan demo ← instructor (check-in sharing on), 3 proof homework items,
// and a group plan with demo as a member. Safe to re-run (reuses the active plan).
//   BASE=https://growl-backend-qa.wispy-leaf-4e8b.workers.dev/api/v1 node scripts/demo/setup-coaching-demo.mjs
const B = process.env.BASE || 'https://growl-backend-qa.wispy-leaf-4e8b.workers.dev/api/v1';
const PW = process.env.DEMO_PASSWORD || 'GrowlDemo123!';
const uuid = () => crypto.randomUUID();

async function api(token, method, path, body) {
  const r = await fetch(B + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(method === 'POST' ? { 'Idempotency-Key': uuid() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok && j.success !== false, data: j.data, error: j.error };
}
async function signIn(email) {
  const r = await api(null, 'POST', '/auth/sign-in', { email, password: PW });
  if (!r.ok) throw new Error(`sign-in ${email}: ${r.status} ${JSON.stringify(r.error)}`);
  return { token: r.data.token || r.data.accessToken, id: r.data.user?.id || r.data.userId };
}
const log = (...a) => console.log(...a);
const listOf = (d) => (Array.isArray(d) ? d : d?.contracts || []);

const D = await signIn('demo@growl.app');
const I = await signIn('instructor@growl.app');
log('demo', D.id, 'instructor', I.id);

let active = listOf((await api(I.token, 'GET', '/instructor/contracts')).data).find(
  (c) => c.status === 'active' && (c.client_id === D.id || c.client?.id === D.id)
);
if (!active) {
  log('inquiry', (await api(D.token, 'POST', '/instructor/inquiries', { instructor_id: I.id, message: 'Hi! I would like to start.' })).status);
  const prop = await api(I.token, 'POST', '/instructor/proposals', {
    client_id: D.id,
    weeks: 4,
    sessions_per_week: 3,
    note: 'Demo plan: 4 weeks, 3 short sessions a week. Check in daily and add proof when you can.',
  });
  log('proposal', prop.status, prop.error?.code || '');
  const proposalId = prop.data?.proposal?.id || prop.data?.id;
  log('accept', (await api(D.token, 'POST', `/instructor/proposals/${proposalId}/accept`, { share_checkins: true })).status);
  active = listOf((await api(I.token, 'GET', '/instructor/contracts')).data).find(
    (c) => c.status === 'active' && (c.client_id === D.id || c.client?.id === D.id)
  );
}
if (!active) throw new Error('no active contract');
log('contract', active.id);
log('sharing on', (await api(D.token, 'PUT', `/instructor/x/contracts/${active.id}/sharing`, { share_checkins: true })).status);

const due = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
for (const hw of [
  { title: 'Send a photo of today’s workout', proof_kind: 'photo' },
  { title: '10-minute mobility routine (use the timer)', proof_kind: 'timer' },
  { title: 'Log your reps for squats', proof_kind: 'number' },
]) {
  const r = await api(I.token, 'POST', `/instructor/contracts/${active.id}/assignments`, { ...hw, due_at: due });
  log('homework', hw.proof_kind, r.status, r.error?.code || '');
}

const coh = await api(I.token, 'POST', '/cohorts', {
  title: 'Demo: 4-week Morning Strength',
  path: 'fitness',
  description: 'A demo group plan to try updates, group homework and the progress grid.',
  weeks: 4,
  start_date: new Date().toISOString().slice(0, 10),
  capacity: 20,
});
log('cohort', coh.status, coh.error?.code || '');
const cohort = coh.data?.cohort || coh.data;
let code = cohort?.invite_code;
if (!code) code = (await api(I.token, 'POST', `/cohorts/${cohort.id}/invite-code`)).data?.invite_code;
log('demo joins', (await api(D.token, 'POST', '/cohorts/join', { code })).status);
log('update', (await api(I.token, 'POST', `/cohorts/${cohort.id}/posts`, {
  body: 'Welcome to week 1! Three short sessions this week — post your proof under the homework. You’ve got this 🌱',
})).status);
log('group homework', (await api(I.token, 'POST', `/cohorts/${cohort.id}/homework`, {
  title: 'Week 1: share one photo from a session',
  due_at: due,
  proof_kind: 'photo',
})).status);
console.log(JSON.stringify({ contract: active.id, cohort: cohort?.id, invite_code: code }));
