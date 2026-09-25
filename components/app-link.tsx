import type { ComponentProps } from 'react';

// Use document navigation while the installed Vinext production Link runtime
// throws during RSC prefetch/navigation. Native anchors retain keyboard,
// history, modified-click and new-tab behavior without intercepting the click.
export default function AppLink({ children, ...props }: ComponentProps<'a'>) {
  return <a {...props}>{children}</a>;
}
