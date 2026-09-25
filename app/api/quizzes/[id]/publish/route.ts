import { handleQuizRequest } from '../../route';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return handleQuizRequest(request, (await context.params).id); }
