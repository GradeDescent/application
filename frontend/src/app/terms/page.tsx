import ReactMarkdown from 'react-markdown';
import { PageShell } from '@/components/page-shell';
import { SiteHeader } from '@/components/site-header';

async function loadTerms() {
  const res = await fetch(
    'https://raw.githubusercontent.com/GradeDescent/.github/refs/heads/main/TERMS.md',
    { next: { revalidate: 3600 } },
  );
  if (!res.ok) {
    return '# Terms of Service\n\nUnable to load the terms at this time.';
  }
  return res.text();
}

export default async function TermsPage() {
  const markdown = await loadTerms();

  return (
    <PageShell className="bg-[radial-gradient(circle_at_top,_rgba(66,129,164,0.1),transparent_55%)]">
      <SiteHeader
        title="Terms"
        subtitle="Terms of service"
        breadcrumbs={[{ label: 'Courses', href: '/courses' }, { label: 'Terms' }]}
      />
      <main className="mx-auto max-w-4xl flex-1 px-6 py-12">
        <article className="privacy-markdown max-w-none rounded-xl border bg-card/90 p-6 shadow">
          <ReactMarkdown>{markdown}</ReactMarkdown>
        </article>
      </main>
    </PageShell>
  );
}
