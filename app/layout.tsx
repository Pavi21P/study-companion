import type { Metadata } from 'next';
import { StudyShell } from '@/components/study-shell';
import { cookies } from 'next/headers';
import './globals.css';
export const metadata: Metadata = { title: 'Study Companion | Course practice', description: 'Explore source-linked quizzes, flashcards, and course progress in the Study Companion demo.' };
export default async function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  const dark = (await cookies()).get('study-theme')?.value === 'dark';
  return <html lang="en" className={dark ? 'dark' : undefined}><body><StudyShell initialDark={dark}>{children}</StudyShell></body></html>;
}
