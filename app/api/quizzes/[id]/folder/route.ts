import { getStudyUser } from '@/lib/identity';
import { getDb } from '@/db';
import { quizPlacementStore } from '@/lib/quiz-placement';
import { quizPlacementApi } from '@/lib/quiz-placement-api';
export const dynamic = 'force-dynamic';
const handle = quizPlacementApi({ user: getStudyUser, store: () => quizPlacementStore(getDb()) });
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return handle(request, (await context.params).id); }
export async function PATCH(request: Request, context: Context) { return handle(request, (await context.params).id); }
