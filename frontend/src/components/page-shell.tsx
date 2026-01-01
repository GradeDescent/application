import { SiteFooter } from '@/components/site-footer';

export function PageShell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-h-screen flex flex-col ${className}`.trim()}>
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
