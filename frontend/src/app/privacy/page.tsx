import ReactMarkdown from 'react-markdown';
import { PageShell } from '@/components/page-shell';
import { SiteHeader } from '@/components/site-header';

async function loadPrivacyPolicy() {
  const res = await fetch(
    'https://raw.githubusercontent.com/GradeDescent/.github/refs/heads/main/PRIVACY.md',
    { next: { revalidate: 3600 } },
  );
  if (!res.ok) {
    return '# Privacy Policy\n\nUnable to load the privacy policy at this time.';
  }
  return res.text();
}

export default async function PrivacyPage() {
  const markdown = await loadPrivacyPolicy();

  return (
    <PageShell className="bg-[radial-gradient(circle_at_top,_rgba(72,169,166,0.1),transparent_55%)]">
      <SiteHeader title="Privacy" subtitle="Privacy policy" />
      <main className="mx-auto max-w-4xl flex-1 px-6 py-12">
        <article className="privacy-markdown max-w-none rounded-xl border bg-card/90 p-6 shadow">
          <ReactMarkdown>{markdown}</ReactMarkdown>
        </article>
      </main>
    </PageShell>
  );
}
