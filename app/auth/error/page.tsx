import Link from '@/components/app-link';
export default function AuthErrorPage() {
  return <section className="panel"><h1>Sign-in could not be completed</h1><p>Please return to your quiz library and try again. Shared quizzes can be answered without signing in.</p><Link href="/">Back to quiz library</Link></section>;
}
