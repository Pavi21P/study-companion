export function safeAuthReturn(value: string | null): string {
  if (!value?.startsWith('/') || value.startsWith('//')) return '/';
  for (const char of value) if (char === '\\' || char.charCodeAt(0) <= 32) return '/';
  try {
    const url = new URL(value, 'https://study.invalid');
    if (url.origin !== 'https://study.invalid' || /^\/(auth(?:\/|$)|signin-with-chatgpt|signout-with-chatgpt|callback)/.test(url.pathname)) return '/';
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}

export function identityMode(value: string | undefined): 'sites' | 'supabase' | 'disabled' {
  if (!value || value === 'sites') return 'sites';
  return value === 'supabase' ? 'supabase' : 'disabled';
}

export function verifiedStudyUser(user: { id: string; email?: string; is_anonymous?: boolean; user_metadata?: Record<string, unknown> } | null) {
  if (!user?.id || !user.email || user.is_anonymous) return null;
  const name = user.user_metadata?.full_name;
  const fullName = typeof name === 'string' && name.trim() ? name.slice(0, 200) : null;
  return { userId: `supabase:${user.id}`, email: user.email, fullName, displayName: fullName ?? user.email };
}
