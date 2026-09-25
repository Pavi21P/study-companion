'use client';

import Link from '@/components/app-link';
import { usePathname } from 'next/navigation';
import { BookOpen, Layers, BarChart3, ArrowUpRight } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

export function StudyShell({ children, initialDark = false }: { children: React.ReactNode; initialDark?: boolean }) {
  const path = usePathname();
  return <><a className="skip-link" href="#main">Skip to content</a><header className="site-header"><Link className="brand" href="/"><BookOpen aria-hidden="true" /> Study Companion<span className="demo-tag">PREVIEW</span></Link><nav aria-label="Main navigation">{[['/', 'Quizzes'], ['/folders', 'Folders'], ['/courses', 'Course files']].map(([href, label]) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>{label}</Link>)}</nav><ThemeToggle initialDark={initialDark}/></header><div className="demo-banner">{(path.startsWith('/shared/') || path.startsWith('/shared-folders/')) ? 'Shared study material · No sign-in needed.' : path === '/' || path.startsWith('/quizzes/') || path.startsWith('/folders') || path.startsWith('/courses') || path.startsWith('/sources/') ? 'Your quizzes and course files are saved privately · AI is optional and off.' : 'Sample study materials · Practice results are not saved.'}</div><main id="main" className="workspace">{children}</main><footer className="site-footer">A little practice. A clearer understanding.<span>Study Companion · Preview</span></footer></>;
}
export function Heading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <div className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>; }
export function StudyLinks() { return <div className="study-links"><Link href="/quiz"><BookOpen aria-hidden="true"/><div><strong>Practice quiz</strong><p>3 sample questions · Instant feedback</p></div><ArrowUpRight aria-hidden="true"/></Link><Link href="/flashcards"><Layers aria-hidden="true"/><div><strong>Review flashcards</strong><p>3 sample cards · At your own pace</p></div><ArrowUpRight aria-hidden="true"/></Link><Link href="/progress"><BarChart3 aria-hidden="true"/><div><strong>View progress</strong><p>Explore example quiz history</p></div><ArrowUpRight aria-hidden="true"/></Link></div>; }
