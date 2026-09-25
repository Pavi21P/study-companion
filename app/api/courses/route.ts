import { getStudyUser } from '@/lib/identity';
import { getDb } from '@/db';
import { courseApi } from '@/lib/course-api';
import { courseStore, parseCourseInput } from '@/lib/courses';

export const dynamic = 'force-dynamic';
export const handleCourseRequest = courseApi({ user: getStudyUser, store: () => courseStore(getDb()), parse: parseCourseInput });
export async function GET(request: Request) { return handleCourseRequest(request); }
export async function POST(request: Request) { return handleCourseRequest(request); }
