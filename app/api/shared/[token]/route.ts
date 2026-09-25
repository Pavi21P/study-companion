import { getDb } from '@/db';
import { sharingStore } from '@/lib/quiz-sharing';
import { guestQuizApi } from '@/lib/quiz-sharing-api';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) { return guestQuizApi(() => sharingStore(getDb()))((await context.params).token); }
