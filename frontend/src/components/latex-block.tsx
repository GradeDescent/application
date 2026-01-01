'use client';

import katex from 'katex';

export function LatexBlock({ tex }: { tex: string }) {
  const html = katex.renderToString(tex, {
    throwOnError: false,
    displayMode: true,
    output: 'html',
  });

  return <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />;
}
