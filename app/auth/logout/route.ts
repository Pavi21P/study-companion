import { authFlow } from '@/lib/auth-flow';
import { serverAuthClient, supabaseConfig } from '@/lib/supabase-auth';
export const dynamic = 'force-dynamic';
const handle = authFlow({ config: supabaseConfig, client: () => serverAuthClient(true) });
export function POST(request: Request) { return handle(request, 'logout'); }
