import { getStudyUser } from '@/lib/identity';
import { getDb } from '@/db';
import { manualQuizApi } from '@/lib/manual-quiz-api';
import { manualQuizStore } from '@/lib/manual-quizzes';
export const dynamic = 'force-dynamic';
export const handleQuizRequest = manualQuizApi({ user: getStudyUser, store: () => manualQuizStore(getDb()) });
export async function GET(request: Request) { return handleQuizRequest(request); }
export async function POST(request: Request) { return handleQuizRequest(request); }
