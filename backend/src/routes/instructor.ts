import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';

/**
 * GET /api/v1/instructor/instructors
 * Get list of instructors
 */
export async function getInstructors(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  try {
    const instructors = await env.DB.prepare(
      `SELECT 
        u.id,
        u.email,
        u.points,
        u.metadata,
        u.is_instructor,
        u.created_at,
        COUNT(DISTINCT iv.id) as vote_count
      FROM users u
      LEFT JOIN instructor_votes iv ON u.id = iv.candidate_id
      WHERE u.is_instructor = 1
      GROUP BY u.id
      ORDER BY vote_count DESC, u.points DESC
      LIMIT ? OFFSET ?`
    )
      .bind(limit, offset)
      .all<{
        id: string;
        email: string;
        points: number;
        metadata: string;
        is_instructor: boolean;
        created_at: string;
        vote_count: number;
      }>();

    const formattedInstructors = instructors.results.map((instructor) => {
      const metadata = JSON.parse(instructor.metadata || '{}');
      return {
        id: instructor.id,
        username: metadata.username,
        avatar: metadata.avatar,
        points: instructor.points,
        vote_count: instructor.vote_count || 0,
        categories: metadata.categories || [],
        created_at: instructor.created_at,
      };
    });

    return json({
      instructors: formattedInstructors,
      total: formattedInstructors.length,
      limit,
      offset,
    });
  } catch (err: any) {
    console.error('[getInstructors] Error:', err);
    const errorMessage = err?.message || 'Failed to fetch instructors';
    // Provide more helpful error message if tables don't exist
    if (errorMessage.includes('no such table')) {
      return error('DATABASE_ERROR', 'Database tables not initialized. Please run migrations.', 500);
    }
    return error('DATABASE_ERROR', errorMessage, 500);
  }
}

/**
 * GET /api/v1/instructor/instructors/:id
 * Get a specific instructor
 */
export async function getInstructor(
  request: Request,
  env: Env,
  instructorId: string
): Promise<Response> {
  try {
    const instructor = await env.DB.prepare(
      `SELECT 
        u.*,
        COUNT(DISTINCT iv.id) as vote_count,
        COUNT(DISTINCT p.id) as post_count
      FROM users u
      LEFT JOIN instructor_votes iv ON u.id = iv.candidate_id
      LEFT JOIN posts p ON u.id = p.user_id
      WHERE u.id = ? AND u.is_instructor = 1
      GROUP BY u.id`
    )
      .bind(instructorId)
      .first<{
        id: string;
        email: string;
        points: number;
        metadata: string;
        is_instructor: boolean;
        created_at: string;
        vote_count: number;
        post_count: number;
      }>();

    if (!instructor) {
      return error('INSTRUCTOR_NOT_FOUND', 'Instructor not found', 404);
    }

    const metadata = JSON.parse(instructor.metadata || '{}');

    return json({
      id: instructor.id,
      username: metadata.username,
      avatar: metadata.avatar,
      points: instructor.points,
      vote_count: instructor.vote_count || 0,
      post_count: instructor.post_count || 0,
      categories: metadata.categories || [],
      created_at: instructor.created_at,
    });
  } catch (err) {
    console.error('[getInstructor] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch instructor', 500);
  }
}

/**
 * POST /api/v1/instructor/instructors/:id/vote
 * Vote for an instructor
 */
export async function voteInstructor(
  request: Request,
  env: Env,
  instructorId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  // Check if instructor exists
  const instructor = await env.DB.prepare('SELECT id, is_instructor FROM users WHERE id = ?')
    .bind(instructorId)
    .first<{ id: string; is_instructor: boolean }>();

  if (!instructor) {
    return error('INSTRUCTOR_NOT_FOUND', 'Instructor not found', 404);
  }

  if (!instructor.is_instructor) {
    return error('INVALID_INSTRUCTOR', 'User is not an instructor', 400);
  }

  // Check if already voted
  const existingVote = await env.DB.prepare(
    'SELECT id FROM instructor_votes WHERE user_id = ? AND candidate_id = ?'
  )
    .bind(ctx.userId, instructorId)
    .first();

  if (existingVote) {
    return error('ALREADY_VOTED', 'You have already voted for this instructor', 400);
  }

  try {
    const voteId = generateId('vote');
    await env.DB.prepare(
      'INSERT INTO instructor_votes (id, user_id, candidate_id, created_at) VALUES (?, ?, ?, datetime("now"))'
    )
      .bind(voteId, ctx.userId, instructorId)
      .run();

    // Award points to instructor
    await env.DB.prepare('UPDATE users SET points = points + 10 WHERE id = ?')
      .bind(instructorId)
      .run();

    return json({ message: 'Vote recorded successfully', voted: true }, 201);
  } catch (err) {
    console.error('[voteInstructor] Error:', err);
    return error('DATABASE_ERROR', 'Failed to record vote', 500);
  }
}

/**
 * GET /api/v1/instructor/instructors/:id/students
 * Get students following an instructor
 */
export async function getInstructorStudents(
  request: Request,
  env: Env,
  instructorId: string
): Promise<Response> {
  try {
    const students = await env.DB.prepare(
      `SELECT DISTINCT
        u.id,
        u.metadata,
        u.points,
        iv.created_at as followed_at
      FROM instructor_votes iv
      JOIN users u ON iv.user_id = u.id
      WHERE iv.candidate_id = ?
      ORDER BY iv.created_at DESC
      LIMIT 100`
    )
      .bind(instructorId)
      .all<{
        id: string;
        metadata: string;
        points: number;
        followed_at: string;
      }>();

    const formattedStudents = students.results.map((student) => {
      const metadata = JSON.parse(student.metadata || '{}');
      return {
        id: student.id,
        username: metadata.username,
        avatar: metadata.avatar,
        points: student.points,
        followed_at: student.followed_at,
      };
    });

    return json({ students: formattedStudents });
  } catch (err) {
    console.error('[getInstructorStudents] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch students', 500);
  }
}
