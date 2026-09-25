'use client';
import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle({ initialDark }: { initialDark: boolean }) {
  const [dark, setDark] = useState(initialDark);
  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    document.cookie = `study-theme=${next ? 'dark' : 'light'}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    setDark(next);
  }
  return <Button className="theme-toggle" variant="outline" aria-label="Dark mode" aria-pressed={dark} onClick={toggle}>
    {dark ? <Sun aria-hidden="true"/> : <Moon aria-hidden="true"/>}{dark ? 'Light mode' : 'Dark mode'}
  </Button>;
}
