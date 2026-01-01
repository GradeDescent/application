export function SiteFooter() {
  return (
    <footer className="border-t bg-background/80">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span>Copyright 2026 the GradeDescent team.</span>
          <a className="underline" href="mailto:support@gradedescent.com">
            support@gradedescent.com
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a className="underline" href="https://github.com/GradeDescent/application" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a className="underline" href="https://x.com/gradedescent" target="_blank" rel="noreferrer">
            X
          </a>
          <a className="underline" href="https://bsky.app/profile/gradedescent.com" target="_blank" rel="noreferrer">
            Bluesky
          </a>
          <a className="underline" href="/privacy">
            Privacy
          </a>
          <a className="underline" href="/terms">
            Terms
          </a>
        </div>
      </div>
    </footer>
  );
}
