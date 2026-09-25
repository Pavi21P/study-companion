// Server-side identity boundary. The current deployment uses Sites authentication.
// A standalone deployment must supply verified sessions here instead of trusting
// Sites headers received directly from the public internet.
import {
  getChatGPTUser,
  requireChatGPTUser,
  chatGPTSignInPath,
  chatGPTSignOutPath,
  type ChatGPTUser,
} from '@/app/chatgpt-auth';
import { redirect } from 'next/navigation';
import { authMode, serverAuthClient } from './supabase-auth';
import { safeAuthReturn, verifiedStudyUser } from './auth-policy';

export type StudyUser = ChatGPTUser;
export async function getStudyUser(): Promise<StudyUser | null> {
  if (authMode() === 'sites') return getChatGPTUser();
  const client = await serverAuthClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getUser();
    return error ? null : verifiedStudyUser(data.user);
  } catch { return null; }
}
export async function requireStudyUser(returnTo: string): Promise<StudyUser> {
  if (authMode() === 'sites') return requireChatGPTUser(returnTo);
  const user = await getStudyUser();
  if (user) return user;
  redirect(signInPath(returnTo));
}
export function signInPath(returnTo: string) {
  return authMode() === 'sites' ? chatGPTSignInPath(returnTo) : `/auth/sign-in?return_to=${encodeURIComponent(safeAuthReturn(returnTo))}`;
}
export function signOutPath(returnTo = '/') {
  return authMode() === 'sites' ? chatGPTSignOutPath(returnTo) : '/auth/sign-out';
}
export const signInLabel = 'Sign in';
