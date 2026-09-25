import Link from '@/components/app-link';
export default function MissingCourse() {
  return <section className="panel"><h1>Course not found</h1><p>This course may not exist or may belong to another account.</p><Link className="text-link" href="/">Return to your courses</Link></section>;
}
