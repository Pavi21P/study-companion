import { handleCourseRequest } from '../route';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return handleCourseRequest(request, (await context.params).id);
}
export async function PATCH(request: Request, context: Context) {
  return handleCourseRequest(request, (await context.params).id);
}
