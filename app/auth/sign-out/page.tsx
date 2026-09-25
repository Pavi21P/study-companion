import Link from '@/components/app-link';
export default function SignOutPage() {
  return <section className="panel"><h1>Sign out?</h1><p>Your saved quizzes and folders will remain in your account.</p><form action="/auth/logout" method="post"><button type="submit">Sign out</button></form><Link href="/">Keep studying</Link></section>;
}
