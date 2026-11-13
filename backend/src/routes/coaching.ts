import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';
import { createUserNotification, resolveUsername } from '../utils/notifications';
import { resolveUserCategories } from '../utils/instructorEligibility';
import {
  addDays,
  clampOfferingInput,
  completedWeeksTogether,
  countCompletedPlans,
  ensureOffering,
  getOffering,
  proposalTotal,
  REVIEW_MIN_WEEKS,
} from '../utils/coachingAccess';
import { findOrCreateConversation } from './messages';

type InquiryRow = {
  id: string;
  instructor_id: string;
  client_id: string;
  conversation_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type ProposalRow = {
  id: string;
  inquiry_id: string;
  instructor_id: string;
  client_id: string;
  conversation_id: string | null;
  weeks: number;
  sessions_per_week: number;
  weekly_fee_eur: number;
  total_eur: number;
  trial_days: number;
  currency: string;
  draw: string;
  note: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
};

type ContractRow = {
  id: string;
  proposal_id: string;
  inquiry_id: string;
  instructor_id: string;
  client_id: string;
  weeks: number;
  sessions_per_week: number;
  weekly_fee_eur: number;
  total_eur: number;
  trial_days: number;
  currency: string;
  draw: string;
  status: string;
  started_at: string;
  ends_at: string;
  completed_at: string | null;
  created_at: string;
};

function parseMeta(raw: string | null | undefined): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

function personFrom(id: string, metadata: string | null | undefined, extras?: Record<string, unknown>) {
  const meta = parseMeta(metadata);
  return {
    id,
    username: (typeof meta.username === 'string' && meta.username.trim()) || 'User',
    avatar: typeof meta.avatar === 'string' ? meta.avatar : null,
    ...extras,
  };
}

function mapProposal(row: ProposalRow) {
  return {
    id: row.id,
    inquiry_id: row.inquiry_id,
    instructor_id: row.instructor_id,
    client_id: row.client_id,
    conversation_id: row.conversation_id,
    weeks: Number(row.weeks),
    sessions_per_week: Number(row.sessions_per_week),
    weekly_fee_eur: Number(row.weekly_fee_eur),
    total_eur: Number(row.total_eur),
    trial_days: Number(row.trial_days) || 0,
    currency: row.currency || 'EUR',
    draw: row.draw || 'weekly',
    note: row.note,
    status: row.status,
    created_at: row.created_at,
    responded_at: row.responded_at,
  };
}

function mapContract(row: ContractRow) {
  return {
    id: row.id,
    proposal_id: row.proposal_id,
    inquiry_id: row.inquiry_id,
    instructor_id: row.instructor_id,
    client_id: row.client_id,
    weeks: Number(row.weeks),
    sessions_per_week: Number(row.sessions_per_week),
    weekly_fee_eur: Number(row.weekly_fee_eur),
    total_eur: Number(row.total_eur),
    trial_days: Number(row.trial_days) || 0,
    currency: row.currency || 'EUR',
    draw: row.draw || 'weekly',
    status: row.status,
    started_at: row.started_at,
    ends_at: row.ends_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
    billing: 'coming' as const,
  };
}

async function requireAuth(request: Request, env: Env) {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId || !ctx.user) {
    return { error: error('UNAUTHORIZED', 'Authentication required', 401) as Response };
  }
  return { ctx };
}

async function maybeExpireEndedContracts(env: Env, userId: string) {
  try {
    await env.DB.prepare(
      `UPDATE coaching_contracts
       SET status = 'completed', completed_at = datetime('now')
       WHERE (instructor_id = ? OR client_id = ?)
         AND status = 'active'
         AND ends_at < datetime('now')`
    )
      .bind(userId, userId)
      .run();
  } catch {
    /* ignore */
  }
}

/**
 * GET /api/v1/instructor/offering
 */
export async function getMyOffering(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if ('error' in auth && auth.error) return auth.error;
  const ctx = auth.ctx!;
  if (!ctx.user!.is_instructor) {
    return error('FORBIDDEN', 'Instructor access required', 403);
  }
  try {
    const offering = await ensureOffering(env, ctx.userId!);
    const completed_plans = await countCompletedPlans(env, ctx.userId!);
    return json({ offering, completed_plans });
  } catch (err) {
    console.error('[getMyOffering]', err);
    return error('DATABASE_ERROR', 'Failed to load offering', 500);
  }
}

/**
 * PUT /api/v1/instructor/offering
 */
export async function updateMyOffering(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if ('error' in auth && auth.error) return auth.error;
  const ctx = auth.ctx!;
  if (!ctx.user!.is_instructor) {
    return error('FORBIDDEN', 'Instructor access required', 403);
  }

  let body: {
    weekly_fee_eur?: number;
    sessions_per_week?: number;
    typical_weeks?: number;
    trial_days?: number;
    accepting?: boolean;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return error('VALIDATION_ERROR', 'Invalid JSON', 400);
  }

  const next = clampOfferingInput(body);
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO instructor_offerings
        (instructor_id, weekly_fee_eur, sessions_per_week, typical_weeks, trial_days, currency, accepting, updated_at)
       VALUES (?, ?, ?, ?, ?, 'EUR', ?, ?)
       ON CONFLICT(instructor_id) DO UPDATE SET
         weekly_fee_eur = excluded.weekly_fee_eur,
         sessions_per_week = excluded.sessions_per_week,
         typical_weeks = excluded.typical_weeks,
         trial_days = excluded.trial_days,
         accepting = excluded.accepting,
         updated_at = excluded.updated_at`
    )
      .bind(
        ctx.userId,
        next.weekly_fee_eur,
        next.sessions_per_week,
        next.typical_weeks,
        next.trial_days,
        next.accepting,
        now
      )
      .run();
    const offering = await getOffering(env, ctx.userId!);
    return json({ offering });
  } catch (err) {
    console.error('[updateMyOffering]', err);
    return error('DATABASE_ERROR', 'Failed to save offering', 500);
  }
}

/**
 * POST /api/v1/instructor/inquiries
 * Client reaches out to a claimed instructor. Creates inquiry + conversation.
 */
export async function startInquiry(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if ('error' in auth && auth.error) return auth.error;
  const ctx = auth.ctx!;

  let body: { instructor_id?: string; message?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return error('VALIDATION_ERROR', 'Invalid JSON', 400);
  }

  const instructorId = (body.instructor_id || '').trim();
  if (!instructorId) return error('VALIDATION_ERROR', 'instructor_id is required', 400);
  if (instructorId === ctx.userId) {
    return error('INVALID_REQUEST', 'You cannot hire yourself', 400);
  }

  const instructor = await env.DB.prepare(
    'SELECT id, is_instructor, metadata FROM users WHERE id = ?'
  )
    .bind(instructorId)
    .first<{ id: string; is_instructor: number; metadata: string }>();
  if (!instructor || !instructor.is_instructor) {
    return error('NOT_FOUND', 'Instructor not found', 404);
  }

  const offering = await getOffering(env, instructorId);
  if (offering && !offering.accepting) {
    return error('NOT_ACCEPTING', 'This instructor is not taking new plans right now', 409);
  }

  const now = new Date().toISOString();
  try {
    const existing = await env.DB.prepare(
      `SELECT * FROM coaching_inquiries WHERE instructor_id = ? AND client_id = ?`
    )
      .bind(instructorId, ctx.userId)
      .first<InquiryRow>();

    let inquiry = existing;
    if (!inquiry) {
      const id = generateId('cinq');
      const conversation = await findOrCreateConversation(env, ctx.userId!, instructorId);
      await env.DB.prepare(
        `INSERT INTO coaching_inquiries
          (id, instructor_id, client_id, conversation_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'talking', ?, ?)`
      )
        .bind(id, instructorId, ctx.userId, conversation.id, now, now)
        .run();
      inquiry = await env.DB.prepare(`SELECT * FROM coaching_inquiries WHERE id = ?`)
        .bind(id)
        .first<InquiryRow>();
    } else {
      const conversation = await findOrCreateConversation(env, ctx.userId!, instructorId);
      if (inquiry.status === 'closed' || inquiry.conversation_id !== conversation.id) {
        await env.DB.prepare(
          `UPDATE coaching_inquiries
           SET status = 'talking', conversation_id = ?, updated_at = ?
           WHERE id = ?`
        )
          .bind(conversation.id, now, inquiry.id)
          .run();
        inquiry = {
          ...inquiry,
          status: 'talking',
          conversation_id: conversation.id,
          updated_at: now,
        };
      }
    }

    const firstMessage = (body.message || '').trim().slice(0, 500);
    if (!existing && firstMessage && inquiry?.conversation_id) {
      await env.DB.prepare(
        `INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind(generateId('msg'), inquiry.conversation_id, ctx.userId, firstMessage, now)
        .run();
      await env.DB.prepare(
        `UPDATE conversations SET updated_at = ?, last_message_at = ? WHERE id = ?`
      )
        .bind(now, now, inquiry.conversation_id)
        .run();
    }

    if (!existing) {
      const clientName = await resolveUsername(env, ctx.userId!);
      await createUserNotification(env, {
        userId: instructorId,
        actorId: ctx.userId,
        type: 'coaching_inquiry',
        title: `${clientName} wants to talk about a plan`,
        body: firstMessage || 'They reached out from your instructor page.',
        refType: 'conversation',
        refId: inquiry?.conversation_id || null,
      });
    }

    const thread = await loadThreadForPair(env, ctx.userId!, instructorId);
    return json({ inquiry, conversation_id: inquiry?.conversation_id, thread }, existing ? 200 : 201);
  } catch (err) {
    console.error('[startInquiry]', err);
    return error('DATABASE_ERROR', 'Failed to start coaching thread', 500);
  }
}

/**
 * GET /api/v1/instructor/inquiries
 */
export async function listInquiries(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if ('error' in auth && auth.error) return auth.error;
  const ctx = auth.ctx!;
  await maybeExpireEndedContracts(env, ctx.userId!);

  try {
    const rows = await env.DB.prepare(
      `SELECT i.*,
        iu.metadata AS instructor_metadata,
        cu.metadata AS client_metadata
       FROM coaching_inquiries i
       JOIN users iu ON iu.id = i.instructor_id
       JOIN users cu ON cu.id = i.client_id
       WHERE i.instructor_id = ? OR i.client_id = ?
       ORDER BY i.updated_at DESC
       LIMIT 40`
    )
      .bind(ctx.userId, ctx.userId)
      .all<InquiryRow & { instructor_metadata: string; client_metadata: string }>();

    const inquiries = (rows.results || []).map((row) => ({
      id: row.id,
      instructor_id: row.instructor_id,
      client_id: row.client_id,
      conversation_id: row.conversation_id,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      role: row.instructor_id === ctx.userId ? 'instructor' : 'client',
      instructor: personFrom(row.instructor_id, row.instructor_metadata),
      client: personFrom(row.client_id, row.client_metadata),
    }));

    return json({ inquiries });
  } catch (err) {
    console.error('[listInquiries]', err);
    return error('DATABASE_ERROR', 'Failed to load inquiries', 500);
  }
}

async function loadThreadForPair(env: Env, userId: string, peerId: string) {
  const inquiry = await env.DB.prepare(
    `SELECT * FROM coaching_inquiries
     WHERE (instructor_id = ? AND client_id = ?) OR (instructor_id = ? AND client_id = ?)
     ORDER BY updated_at DESC LIMIT 1`
  )
    .bind(userId, peerId, peerId, userId)
    .first<InquiryRow>();

  const proposal = await env.DB.prepare(
    `SELECT * FROM coaching_proposals
     WHERE ((instructor_id = ? AND client_id = ?) OR (instructor_id = ? AND client_id = ?))
       AND status IN ('sent', 'accepted', 'declined')
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(userId, peerId, peerId, userId)
    .first<ProposalRow>();

  const contract = await env.DB.prepare(
    `SELECT * FROM coaching_contracts
     WHERE (instructor_id = ? AND client_id = ?) OR (instructor_id = ? AND client_id = ?)
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(userId, peerId, peerId, userId)
    .first<ContractRow>();

  const instructorId = inquiry?.instructor_id || proposal?.instructor_id || contract?.instructor_id;
  const offering = instructorId ? await getOffering(env, instructorId) : null;

  return {
    inquiry: inquiry
      ? {
          id: inquiry.id,
          instructor_id: inquiry.instructor_id,
          client_id: inquiry.client_id,
          conversation_id: inquiry.conversation_id,
          status: inquiry.status,
        }
      : null,
    proposal: proposal ? mapProposal(proposal) : null,
    contract: contract ? mapContract(contract) : null,
    offering,
    role: instructorId && instructorId === userId ? 'instructor' : 'client',
  };
}

/**
 * GET /api/v1/instructor/thread?peer_id=
 */
export async function getThread(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if ('error' in auth && auth.error) return auth.error;
  const ctx = auth.ctx!;
  const peerId = new URL(request.url).searchParams.get('peer_id') || '';
  if (!peerId) return error('VALIDATION_ERROR', 'peer_id is required', 400);

  try {
    await maybeExpireEndedContracts(env, ctx.userId!);
    const thread = await loadThreadForPair(env, ctx.userId!, peerId);
    return json(thread);
  } catch (err) {
    console.error('[getThread]', err);
    return error('DATABASE_ERROR', 'Failed to load coaching thread', 500);
  }
}

/**
 * POST /api/v1/instructor/proposals
 */
export async function sendProposal(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if ('error' in auth && auth.error) return auth.error;
  const ctx = auth.ctx!;
  if (!ctx.user!.is_instructor) {
    return error('FORBIDDEN', 'Instructor access required', 403);
  }

  let body: {
    client_id?: string;
    weeks?: number;
    sessions_per_week?: number;
    weekly_fee_eur?: number;
    note?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return error('VALIDATION_ERROR', 'Invalid JSON', 400);
  }

  const clientId = (body.client_id || '').trim();
  if (!clientId || clientId === ctx.userId) {
    return error('VALIDATION_ERROR', 'client_id is required', 400);
  }

  const offering = await ensureOffering(env, ctx.userId!);
  const weeks = Math.min(26, Math.max(1, Math.floor(Number(body.weeks) || offering.typical_weeks)));
  const sessions = Math.min(
    7,
    Math.max(1, Math.floor(Number(body.sessions_per_week) || offering.sessions_per_week))
  );
  const weekly = Math.min(
    500,
    Math.max(1, Math.round((Number(body.weekly_fee_eur) || offering.weekly_fee_eur) * 100) / 100)
  );
  const total = proposalTotal(weeks, weekly);
  const trialDays = offering.trial_days;
  const note = (body.note || '').trim().slice(0, 800) || null;

  try {
    const client = await env.DB.prepare('SELECT id, metadata FROM users WHERE id = ?')
      .bind(clientId)
      .first<{ id: string; metadata: string }>();
    if (!client) return error('NOT_FOUND', 'Client not found', 404);

    let inquiry = await env.DB.prepare(
      `SELECT * FROM coaching_inquiries WHERE instructor_id = ? AND client_id = ?`
    )
      .bind(ctx.userId, clientId)
      .first<InquiryRow>();

    const conversation = await findOrCreateConversation(env, ctx.userId!, clientId);
    const now = new Date().toISOString();

    if (!inquiry) {
      const id = generateId('cinq');
      await env.DB.prepare(
        `INSERT INTO coaching_inquiries
          (id, instructor_id, client_id, conversation_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'talking', ?, ?)`
      )
        .bind(id, ctx.userId, clientId, conversation.id, now, now)
        .run();
      inquiry = await env.DB.prepare(`SELECT * FROM coaching_inquiries WHERE id = ?`)
        .bind(id)
        .first<InquiryRow>();
    } else if (inquiry.status === 'closed') {
      await env.DB.prepare(
        `UPDATE coaching_inquiries SET status = 'talking', conversation_id = ?, updated_at = ? WHERE id = ?`
      )
        .bind(conversation.id, now, inquiry.id)
        .run();
    }

    await env.DB.prepare(
      `UPDATE coaching_proposals SET status = 'expired', responded_at = ?
       WHERE instructor_id = ? AND client_id = ? AND status = 'sent'`
    )
      .bind(now, ctx.userId, clientId)
      .run();

    const proposalId = generateId('cprop');
    await env.DB.prepare(
      `INSERT INTO coaching_proposals
        (id, inquiry_id, instructor_id, client_id, conversation_id, weeks, sessions_per_week,
         weekly_fee_eur, total_eur, trial_days, currency, draw, note, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', 'weekly', ?, 'sent', ?)`
    )
      .bind(
        proposalId,
        inquiry!.id,
        ctx.userId,
        clientId,
        conversation.id,
        weeks,
        sessions,
        weekly,
        total,
        trialDays,
        note,
        now
      )
      .run();

    const summary = `${weeks} week${weeks === 1 ? '' : 's'} · ${sessions}× / week · €${weekly}/week · €${total} total${
      trialDays ? ` · ${trialDays}-day trial` : ''
    }`;
    const bodyText = note ? `Proposal: ${summary}\n${note}` : `Proposal: ${summary}`;
    await env.DB.prepare(
      `INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(generateId('msg'), conversation.id, ctx.userId, bodyText, now)
      .run();
    await env.DB.prepare(
      `UPDATE conversations SET updated_at = ?, last_message_at = ? WHERE id = ?`
    )
      .bind(now, now, conversation.id)
      .run();
    await env.DB.prepare(`UPDATE coaching_inquiries SET updated_at = ? WHERE id = ?`)
      .bind(now, inquiry!.id)
      .run();

    const coachName = await resolveUsername(env, ctx.userId!);
    await createUserNotification(env, {
      userId: clientId,
      actorId: ctx.userId,
      type: 'coaching_proposal',
      title: `${coachName} sent you a coaching plan`,
      body: summary,
      refType: 'conversation',
      refId: conversation.id,
    });

    const row = await env.DB.prepare(`SELECT * FROM coaching_proposals WHERE id = ?`)
      .bind(proposalId)
      .first<ProposalRow>();
    return json({ proposal: mapProposal(row!), conversation_id: conversation.id }, 201);
  } catch (err) {
    console.error('[sendProposal]', err);
    return error('DATABASE_ERROR', 'Failed to send proposal', 500);
  }
}

async function respondProposal(
  request: Request,
  env: Env,
  proposalId: string,
  decision: 'accepted' | 'declined'
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if ('error' in auth && auth.error) return auth.error;
  const ctx = auth.ctx!;

  try {
    const proposal = await env.DB.prepare(`SELECT * FROM coaching_proposals WHERE id = ?`)
      .bind(proposalId)
      .first<ProposalRow>();
    if (!proposal) return error('NOT_FOUND', 'Proposal not found', 404);
    if (proposal.client_id !== ctx.userId) {
      return error('FORBIDDEN', 'Only the client can respond to this proposal', 403);
    }

    if (proposal.status === 'accepted' && decision === 'accepted') {
      const existing = await env.DB.prepare(
        `SELECT * FROM coaching_contracts WHERE proposal_id = ?`
      )
        .bind(proposal.id)
        .first<ContractRow>();
      return json({
        proposal: mapProposal(proposal),
        contract: existing ? mapContract(existing) : null,
      });
    }
    if (proposal.status !== 'sent') {
      return error('INVALID_STATE', 'This proposal is no longer open', 409);
    }

    const now = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE coaching_proposals SET status = ?, responded_at = ? WHERE id = ?`
    )
      .bind(decision, now, proposal.id)
      .run();

    let contract: ContractRow | null = null;
    if (decision === 'accepted') {
      const started = now;
      const ends = addDays(started, proposal.weeks * 7);
      const contractId = generateId('ccon');
      await env.DB.prepare(
        `INSERT INTO coaching_contracts
          (id, proposal_id, inquiry_id, instructor_id, client_id, weeks, sessions_per_week,
           weekly_fee_eur, total_eur, trial_days, currency, draw, status, started_at, ends_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'weekly', 'active', ?, ?, ?)`
      )
        .bind(
          contractId,
          proposal.id,
          proposal.inquiry_id,
          proposal.instructor_id,
          proposal.client_id,
          proposal.weeks,
          proposal.sessions_per_week,
          proposal.weekly_fee_eur,
          proposal.total_eur,
          proposal.trial_days,
          proposal.currency,
          started,
          ends,
          now
        )
        .run();
      contract = await env.DB.prepare(`SELECT * FROM coaching_contracts WHERE id = ?`)
        .bind(contractId)
        .first<ContractRow>();

      if (proposal.conversation_id) {
        await env.DB.prepare(
          `INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
          .bind(
            generateId('msg'),
            proposal.conversation_id,
            ctx.userId,
            'Plan accepted. Plan active · billing coming.',
            now
          )
          .run();
        await env.DB.prepare(
          `UPDATE conversations SET updated_at = ?, last_message_at = ? WHERE id = ?`
        )
          .bind(now, now, proposal.conversation_id)
          .run();
      }
    }

    const clientName = await resolveUsername(env, ctx.userId!);
    await createUserNotification(env, {
      userId: proposal.instructor_id,
      actorId: ctx.userId,
      type: decision === 'accepted' ? 'coaching_accepted' : 'coaching_proposal',
      title:
        decision === 'accepted'
          ? `${clientName} accepted your coaching plan`
          : `${clientName} declined your proposal`,
      body:
        decision === 'accepted'
          ? 'Plan active · billing coming. Assign homework when you are ready.'
          : 'You can send another proposal after you talk.',
      refType: decision === 'accepted' && contract ? 'coaching_contract' : 'conversation',
      refId: decision === 'accepted' && contract ? contract.id : proposal.conversation_id,
    });

    return json({
      proposal: mapProposal({ ...proposal, status: decision, responded_at: now }),
      contract: contract ? mapContract(contract) : null,
    });
  } catch (err) {
    console.error('[respondProposal]', err);
    return error('DATABASE_ERROR', 'Failed to update proposal', 500);
  }
}

export async function acceptProposal(
  request: Request,
  env: Env,
  proposalId: string
): Promise<Response> {
  return respondProposal(request, env, proposalId, 'accepted');
}

export async function declineProposal(
  request: Request,
  env: Env,
  proposalId: string
): Promise<Response> {
  return respondProposal(request, env, proposalId, 'declined');
}

/**
 * GET /api/v1/instructor/contracts
 */
export async function listContracts(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if ('error' in auth && auth.error) return auth.error;
  const ctx = auth.ctx!;
  await maybeExpireEndedContracts(env, ctx.userId!);

  try {
    const rows = await env.DB.prepare(
      `SELECT c.*,
        iu.metadata AS instructor_metadata,
        cu.metadata AS client_metadata
       FROM coaching_contracts c
       JOIN users iu ON iu.id = c.instructor_id
       JOIN users cu ON cu.id = c.client_id
       WHERE c.instructor_id = ? OR c.client_id = ?
       ORDER BY c.created_at DESC
       LIMIT 40`
    )
      .bind(ctx.userId, ctx.userId)
      .all<ContractRow & { instructor_metadata: string; client_metadata: string }>();

    const contracts = (rows.results || []).map((row) => ({
      ...mapContract(row),
      role: row.instructor_id === ctx.userId ? 'instructor' : 'client',
      instructor: personFrom(row.instructor_id, row.instructor_metadata),
      client: personFrom(row.client_id, row.client_metadata),
    }));

    return json({ contracts });
  } catch (err) {
    console.error('[listContracts]', err);
    return error('DATABASE_ERROR', 'Failed to load contracts', 500);
  }
}

async function loadAssignments(env: Env, contractId: string) {
  const rows = await env.DB.prepare(
    `SELECT
        a.*,
        s.title AS seed_title,
        s.stage,
        s.growth_score,
        s.status AS seed_status,
        s.category_key,
        s.subcategory_key,
        (SELECT photo_url FROM growth_seed_events
          WHERE seed_id = a.seed_id AND photo_url IS NOT NULL
          ORDER BY created_at DESC LIMIT 1) AS last_photo,
        (SELECT action FROM growth_seed_events
          WHERE seed_id = a.seed_id
          ORDER BY created_at DESC LIMIT 1) AS last_action,
        (SELECT created_at FROM growth_seed_events
          WHERE seed_id = a.seed_id
          ORDER BY created_at DESC LIMIT 1) AS last_activity_at
     FROM coaching_assignments a
     LEFT JOIN growth_seeds s ON s.id = a.seed_id
     WHERE a.contract_id = ?
     ORDER BY a.created_at DESC`
  )
    .bind(contractId)
    .all<{
      id: string;
      contract_id: string;
      seed_id: string;
      title: string | null;
      due_at: string | null;
      status: string;
      created_at: string;
      completed_at: string | null;
      seed_title: string | null;
      stage: string | null;
      growth_score: number | null;
      seed_status: string | null;
      category_key: string | null;
      subcategory_key: string | null;
      last_photo: string | null;
      last_action: string | null;
      last_activity_at: string | null;
    }>();

  return (rows.results || []).map((row) => ({
    id: row.id,
    contract_id: row.contract_id,
    seed_id: row.seed_id,
    title: row.title || row.seed_title || 'Homework',
    due_at: row.due_at,
    status: row.status,
    created_at: row.created_at,
    completed_at: row.completed_at,
    seed: {
      id: row.seed_id,
      title: row.seed_title,
      stage: row.stage,
      growth_score: Number(row.growth_score) || 0,
      status: row.seed_status,
      category_key: row.category_key,
      subcategory_key: row.subcategory_key,
    },
    last_photo: row.last_photo,
    last_action: row.last_action,
    last_activity_at: row.last_activity_at,
  }));
}

/**
 * GET /api/v1/instructor/contracts/:id
 */
export async function getContract(
  request: Request,
  env: Env,
  contractId: string
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if ('error' in auth && auth.error) return auth.error;
  const ctx = auth.ctx!;
  await maybeExpireEndedContracts(env, ctx.userId!);

  try {
    const row = await env.DB.prepare(
      `SELECT c.*,
        iu.metadata AS instructor_metadata,
        cu.metadata AS client_metadata
       FROM coaching_contracts c
       JOIN users iu ON iu.id = c.instructor_id
       JOIN users cu ON cu.id = c.client_id
       WHERE c.id = ?`
    )
      .bind(contractId)
      .first<ContractRow & { instructor_metadata: string; client_metadata: string }>();

    if (!row) return error('NOT_FOUND', 'Contract not found', 404);
    if (row.instructor_id !== ctx.userId && row.client_id !== ctx.userId) {
      return error('FORBIDDEN', 'Not a party to this plan', 403);
    }

    const assignments = await loadAssignments(env, contractId);
    let review = null;
    try {
      review = await reviewStateForPair(env, ctx.userId!, row.instructor_id, row.client_id);
    } catch {
      review = null;
    }
    return json({
      contract: {
        ...mapContract(row),
        role: row.instructor_id === ctx.userId ? 'instructor' : 'client',
        instructor: personFrom(row.instructor_id, row.instructor_metadata),
        client: personFrom(row.client_id, row.client_metadata),
      },
      assignments,
      review,
    });
  } catch (err) {
    console.error('[getContract]', err);
    return error('DATABASE_ERROR', 'Failed to load contract', 500);
  }
}

/**
 * POST /api/v1/instructor/contracts/:id/complete
 */
export async function completeContract(
  request: Request,
  env: Env,
  contractId: string
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if ('error' in auth && auth.error) return auth.error;
  const ctx = auth.ctx!;

  try {
    const row = await env.DB.prepare(`SELECT * FROM coaching_contracts WHERE id = ?`)
      .bind(contractId)
      .first<ContractRow>();
    if (!row) return error('NOT_FOUND', 'Contract not found', 404);
    if (row.instructor_id !== ctx.userId && row.client_id !== ctx.userId) {
      return error('FORBIDDEN', 'Not a party to this plan', 403);
    }
    if (row.status !== 'active') {
      return json({ contract: mapContract(row) });
    }
    const now = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE coaching_contracts SET status = 'completed', completed_at = ? WHERE id = ?`
    )
      .bind(now, contractId)
      .run();
    return json({ contract: mapContract({ ...row, status: 'completed', completed_at: now }) });
  } catch (err) {
    console.error('[completeContract]', err);
    return error('DATABASE_ERROR', 'Failed to complete contract', 500);
  }
}

/** Split a stored path ("parent" or "parent:sub"). */
function splitPath(raw: string): { cat: string; sub: string } {
  const c = String(raw || '').trim();
  const i = c.indexOf(':');
  return i < 0 ? { cat: c, sub: '' } : { cat: c.slice(0, i).trim(), sub: c.slice(i + 1).trim() };
}

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Category/sub-path for a new homework seed, chosen from `pathCats` (the client's
 * paths, or the coach's when the client has none). A requested category is used
 * only if it is one of those paths. The sub-path prefers: requested sub → the
 * path's own sub → a slug of the title → 'practice'.
 */
export function pickHomeworkPath(
  pathCats: string[],
  requestedCat: string,
  requestedSub: string,
  title: string
): { categoryKey: string; subcategoryKey: string } | null {
  const paths = pathCats.map(splitPath).filter((p) => p.cat);
  let categoryKey = '';
  let subcategoryKey = '';

  if (paths.length) {
    const wanted = requestedCat.toLowerCase();
    const match = wanted ? paths.filter((p) => p.cat.toLowerCase() === wanted) : [];
    if (match.length) {
      categoryKey = match[0].cat;
      const subs = match.map((p) => p.sub).filter(Boolean);
      subcategoryKey =
        (requestedSub && (subs.length === 0 || subs.includes(requestedSub)) ? requestedSub : '') ||
        subs[0] ||
        requestedSub;
    } else {
      categoryKey = paths[0].cat;
      subcategoryKey = paths.find((p) => p.cat === categoryKey && p.sub)?.sub || '';
    }
  } else if (requestedCat) {
    categoryKey = requestedCat;
    subcategoryKey = requestedSub;
  }

  if (!categoryKey) return null;
  return {
    categoryKey,
    subcategoryKey: subcategoryKey || slugify(title) || 'practice',
  };
}

/**
 * POST /api/v1/instructor/contracts/:id/assignments
 * Instructor plants or attaches a Garden seed as homework.
 */
export async function assignHomework(
  request: Request,
  env: Env,
  contractId: string
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if ('error' in auth && auth.error) return auth.error;
  const ctx = auth.ctx!;

  let body: {
    seed_id?: string;
    title?: string;
    category_key?: string;
    subcategory_key?: string;
    due_at?: string;
    goal_detail?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return error('VALIDATION_ERROR', 'Invalid JSON', 400);
  }

  try {
    const contract = await env.DB.prepare(`SELECT * FROM coaching_contracts WHERE id = ?`)
      .bind(contractId)
      .first<ContractRow>();
    if (!contract) return error('NOT_FOUND', 'Contract not found', 404);
    if (contract.instructor_id !== ctx.userId) {
      return error('FORBIDDEN', 'Only the instructor can assign homework', 403);
    }
    if (contract.status !== 'active') {
      return error('INVALID_STATE', 'This plan is no longer active', 409);
    }

    const now = new Date().toISOString();
    let seedId = (body.seed_id || '').trim();
    const title = (body.title || '').trim().slice(0, 120);
    const assignmentId = generateId('casm');
    const dueAt = (body.due_at || '').trim() || null;
    // Seed rows + assignment go in one batch so a failure can't leave an orphan seed.
    const writes: D1PreparedStatement[] = [];

    if (!seedId) {
      // Homework grows on the CLIENT's paths; the coach's own paths are only a
      // fallback when the client has none yet.
      const clientCats = await resolveUserCategories(env, contract.client_id);
      const pathCats = clientCats.length
        ? clientCats
        : await resolveUserCategories(env, ctx.userId!, ctx.user?.metadata);
      const path = pickHomeworkPath(
        pathCats,
        (body.category_key || '').trim(),
        (body.subcategory_key || '').trim(),
        title
      );
      if (!path) {
        return error('VALIDATION_ERROR', 'Pick a path for this homework', 400);
      }

      seedId = generateId('seed');
      const seedTitle = title || 'Homework';
      // One owner (the client) plus the coach as instructor → 'solo' ownership.
      // No metric columns: homework has no numeric target, so check-ins never demand a number/photo.
      writes.push(
        env.DB.prepare(
          `INSERT INTO growth_seeds
            (id, category_key, subcategory_key, title, stage, growth_score, status, ownership,
             visibility, planted_by_user_id, planted_at, created_at, updated_at, goal_detail)
           VALUES (?, ?, ?, ?, 'seed', 0, 'growing', 'solo', 'private', ?, ?, ?, ?, ?)`
        ).bind(
          seedId,
          path.categoryKey,
          path.subcategoryKey,
          seedTitle,
          ctx.userId,
          now,
          now,
          now,
          (body.goal_detail || '').trim().slice(0, 800) || 'Homework from your coach'
        ),
        env.DB.prepare(
          `INSERT INTO growth_seed_members (seed_id, user_id, role, status, joined_at)
           VALUES (?, ?, 'owner', 'active', ?)`
        ).bind(seedId, contract.client_id, now),
        env.DB.prepare(
          `INSERT INTO growth_seed_members (seed_id, user_id, role, status, joined_at)
           VALUES (?, ?, 'instructor', 'active', ?)`
        ).bind(seedId, ctx.userId, now)
      );
    } else {
      const seed = await env.DB.prepare(`SELECT id, title FROM growth_seeds WHERE id = ?`)
        .bind(seedId)
        .first<{ id: string; title: string }>();
      if (!seed) return error('NOT_FOUND', 'Seed not found', 404);
      // Only the client's own seeds can carry homework — otherwise a coach could
      // attach themselves (and their client) to anyone's seed by id.
      const clientOwner = await env.DB.prepare(
        `SELECT user_id FROM growth_seed_members
         WHERE seed_id = ? AND user_id = ? AND role = 'owner' AND status = 'active'`
      )
        .bind(seedId, contract.client_id)
        .first();
      if (!clientOwner) {
        return error('FORBIDDEN', 'Homework can only be attached to one of your client’s own seeds', 403);
      }
      const coachMember = await env.DB.prepare(
        `SELECT user_id FROM growth_seed_members WHERE seed_id = ? AND user_id = ?`
      )
        .bind(seedId, ctx.userId)
        .first();
      if (!coachMember) {
        writes.push(
          env.DB.prepare(
            `INSERT INTO growth_seed_members (seed_id, user_id, role, status, joined_at)
             VALUES (?, ?, 'instructor', 'active', ?)`
          ).bind(seedId, ctx.userId, now)
        );
      }
    }

    writes.push(
      env.DB.prepare(
        `INSERT INTO coaching_assignments
          (id, contract_id, seed_id, title, due_at, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'assigned', ?)`
      ).bind(assignmentId, contractId, seedId, title || null, dueAt, now)
    );
    await env.DB.batch(writes);

    const coachName = await resolveUsername(env, ctx.userId!);
    await createUserNotification(env, {
      userId: contract.client_id,
      actorId: ctx.userId,
      type: 'coaching_homework',
      title: `${coachName} assigned homework`,
      body: title || 'Check in with a photo when you finish.',
      // Seeds/Garden is hidden in the app — open the coaching plan, not the seed.
      refType: 'coaching_contract',
      refId: contractId,
    });

    const assignments = await loadAssignments(env, contractId);
    return json({ assignment: assignments.find((a) => a.id === assignmentId), assignments }, 201);
  } catch (err) {
    console.error('[assignHomework]', err);
    return error('DATABASE_ERROR', 'Failed to assign homework', 500);
  }
}

type ReviewRow = {
  id: string;
  contract_id: string | null;
  instructor_id: string;
  client_id: string;
  reviewer_id: string;
  subject_id: string;
  direction: string;
  stars: number;
  follow_through: number | null;
  body: string | null;
  created_at: string;
  updated_at: string;
};

function mapReview(row: ReviewRow, reviewerName?: string, reviewerAvatar?: string | null) {
  return {
    id: row.id,
    contract_id: row.contract_id,
    instructor_id: row.instructor_id,
    client_id: row.client_id,
    reviewer_id: row.reviewer_id,
    subject_id: row.subject_id,
    direction: row.direction,
    stars: Number(row.stars) || 0,
    follow_through: row.follow_through == null ? null : Number(row.follow_through),
    body: row.body,
    created_at: row.created_at,
    reviewer: reviewerName
      ? { id: row.reviewer_id, username: reviewerName, avatar: reviewerAvatar || null }
      : undefined,
  };
}

async function reviewStateForPair(
  env: Env,
  viewerId: string,
  instructorId: string,
  clientId: string
) {
  const weeks = await completedWeeksTogether(env, instructorId, clientId);
  const eligible = weeks >= REVIEW_MIN_WEEKS;
  const direction =
    viewerId === instructorId
      ? 'instructor_to_client'
      : viewerId === clientId
        ? 'client_to_instructor'
        : null;
  let mine: ReviewRow | null = null;
  if (direction) {
    mine = await env.DB.prepare(
      `SELECT * FROM coaching_reviews
       WHERE instructor_id = ? AND client_id = ? AND direction = ?`
    )
      .bind(instructorId, clientId, direction)
      .first<ReviewRow>();
  }
  return {
    weeks_completed: weeks,
    weeks_needed: REVIEW_MIN_WEEKS,
    eligible,
    direction,
    mine: mine ? mapReview(mine) : null,
  };
}

/**
 * GET /api/v1/instructor/reviews/eligibility?peer_id=
 */
export async function getReviewEligibility(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if ('error' in auth && auth.error) return auth.error;
  const ctx = auth.ctx!;
  const peerId = new URL(request.url).searchParams.get('peer_id') || '';
  if (!peerId) return error('VALIDATION_ERROR', 'peer_id is required', 400);

  try {
    const peer = await env.DB.prepare('SELECT id, is_instructor FROM users WHERE id = ?')
      .bind(peerId)
      .first<{ id: string; is_instructor: number }>();
    if (!peer) return error('NOT_FOUND', 'User not found', 404);

    const instructorId = ctx.user!.is_instructor ? ctx.userId! : peer.is_instructor ? peerId : '';
    const clientId = instructorId === ctx.userId ? peerId : ctx.userId!;
    if (!instructorId || instructorId === clientId) {
      return json({
        weeks_completed: 0,
        weeks_needed: REVIEW_MIN_WEEKS,
        eligible: false,
        direction: null,
        mine: null,
      });
    }
    return json(await reviewStateForPair(env, ctx.userId!, instructorId, clientId));
  } catch (err) {
    console.error('[getReviewEligibility]', err);
    return error('DATABASE_ERROR', 'Failed to load review eligibility', 500);
  }
}

/**
 * GET /api/v1/instructor/instructors/:id/reviews
 */
export async function listInstructorReviews(
  request: Request,
  env: Env,
  instructorId: string
): Promise<Response> {
  try {
    const rows = await env.DB.prepare(
      `SELECT r.*, u.metadata AS reviewer_metadata
       FROM coaching_reviews r
       JOIN users u ON u.id = r.reviewer_id
       WHERE r.instructor_id = ? AND r.direction = 'client_to_instructor'
       ORDER BY r.created_at DESC
       LIMIT 12`
    )
      .bind(instructorId)
      .all<ReviewRow & { reviewer_metadata: string }>();

    const reviews = (rows.results || []).map((row) => {
      const meta = parseMeta(row.reviewer_metadata);
      return mapReview(
        row,
        (typeof meta.username === 'string' && meta.username) || 'Client',
        typeof meta.avatar === 'string' ? meta.avatar : null
      );
    });
    const avg =
      reviews.length === 0
        ? 0
        : Math.round((reviews.reduce((s, r) => s + r.stars, 0) / reviews.length) * 10) / 10;
    return json({ reviews, rating: { avg, count: reviews.length } });
  } catch (err) {
    console.error('[listInstructorReviews]', err);
    return error('DATABASE_ERROR', 'Failed to load reviews', 500);
  }
}

/**
 * POST /api/v1/instructor/reviews
 */
export async function upsertReview(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if ('error' in auth && auth.error) return auth.error;
  const ctx = auth.ctx!;

  let body: {
    peer_id?: string;
    contract_id?: string;
    stars?: number;
    follow_through?: number;
    body?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return error('VALIDATION_ERROR', 'Invalid JSON', 400);
  }

  const peerId = (body.peer_id || '').trim();
  if (!peerId || peerId === ctx.userId) {
    return error('VALIDATION_ERROR', 'peer_id is required', 400);
  }

  const stars = Math.min(5, Math.max(1, Math.round(Number(body.stars) || 0)));
  if (!Number.isFinite(stars) || stars < 1) {
    return error('VALIDATION_ERROR', 'Stars must be 1 to 5', 400);
  }
  const followThroughRaw = Number(body.follow_through);
  const followThrough = Number.isFinite(followThroughRaw)
    ? Math.min(5, Math.max(1, Math.round(followThroughRaw)))
    : null;
  const note = (body.body || '').trim().slice(0, 600) || null;

  try {
    const peer = await env.DB.prepare('SELECT id, is_instructor FROM users WHERE id = ?')
      .bind(peerId)
      .first<{ id: string; is_instructor: number }>();
    if (!peer) return error('NOT_FOUND', 'User not found', 404);

    const iAmCoach = !!ctx.user!.is_instructor;
    const instructorId = iAmCoach ? ctx.userId! : peer.is_instructor ? peerId : '';
    const clientId = instructorId === ctx.userId ? peerId : ctx.userId!;
    if (!instructorId || instructorId === clientId) {
      return error('FORBIDDEN', 'Reviews are only between a coach and their client', 403);
    }

    const weeks = await completedWeeksTogether(env, instructorId, clientId);
    if (weeks < REVIEW_MIN_WEEKS) {
      return error(
        'NEED_FOUR_WEEKS',
        `Reviews open after ${REVIEW_MIN_WEEKS} completed weeks together. You have ${weeks}.`,
        403
      );
    }

    const direction = iAmCoach && instructorId === ctx.userId
      ? 'instructor_to_client'
      : 'client_to_instructor';
    if (direction === 'instructor_to_client' && instructorId !== ctx.userId) {
      return error('FORBIDDEN', 'Only the instructor can rate this client', 403);
    }
    if (direction === 'client_to_instructor' && clientId !== ctx.userId) {
      return error('FORBIDDEN', 'Only the client can review this instructor', 403);
    }

    const now = new Date().toISOString();
    const existing = await env.DB.prepare(
      `SELECT id FROM coaching_reviews
       WHERE instructor_id = ? AND client_id = ? AND direction = ?`
    )
      .bind(instructorId, clientId, direction)
      .first<{ id: string }>();

    const id = existing?.id || generateId('crev');
    if (existing) {
      await env.DB.prepare(
        `UPDATE coaching_reviews
         SET stars = ?, follow_through = ?, body = ?, contract_id = COALESCE(?, contract_id), updated_at = ?
         WHERE id = ?`
      )
        .bind(
          stars,
          direction === 'instructor_to_client' ? followThrough || stars : null,
          note,
          body.contract_id || null,
          now,
          id
        )
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO coaching_reviews
          (id, contract_id, instructor_id, client_id, reviewer_id, subject_id, direction,
           stars, follow_through, body, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          id,
          body.contract_id || null,
          instructorId,
          clientId,
          ctx.userId,
          direction === 'instructor_to_client' ? clientId : instructorId,
          direction,
          stars,
          direction === 'instructor_to_client' ? followThrough || stars : null,
          note,
          now,
          now
        )
        .run();
    }

    const row = await env.DB.prepare(`SELECT * FROM coaching_reviews WHERE id = ?`)
      .bind(id)
      .first<ReviewRow>();
    const subjectId = direction === 'instructor_to_client' ? clientId : instructorId;
    const actorName = await resolveUsername(env, ctx.userId!);
    await createUserNotification(env, {
      userId: subjectId,
      actorId: ctx.userId,
      type: 'coaching_accepted',
      title:
        direction === 'instructor_to_client'
          ? `${actorName} rated your follow-through`
          : `${actorName} left a review`,
      body: note || `${stars} stars`,
      refType: 'user',
      refId: ctx.userId,
    });

    return json({ review: mapReview(row!) }, existing ? 200 : 201);
  } catch (err) {
    console.error('[upsertReview]', err);
    return error('DATABASE_ERROR', 'Failed to save review', 500);
  }
}

