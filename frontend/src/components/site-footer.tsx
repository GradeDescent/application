import { Github } from 'lucide-react';

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-background/70 text-muted-foreground/80">
      <div className="mx-auto grid max-w-5xl gap-6 px-6 py-6 text-xs md:grid-cols-[1.2fr_0.8fr] md:items-start">
        <div className="space-y-3">
          <p>
            Copyright © {year},{' '}
            <a className="hover:text-foreground" href="https://github.com/gradedescent" target="_blank" rel="noreferrer">
              the GradeDescent team
            </a>
            .
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a className="hover:text-foreground" href="mailto:support@gradedescent.com">
              support@gradedescent.com
            </a>
            <span className="text-muted-foreground/60">•</span>
            <a className="hover:text-foreground" href="/privacy">
              Privacy
            </a>
            <span className="text-muted-foreground/60">•</span>
            <a className="hover:text-foreground" href="/terms">
              Terms
            </a>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <a
            className="flex items-center gap-2 hover:text-foreground"
            href="https://github.com/GradeDescent/application"
            target="_blank"
            rel="noreferrer"
          >
            <Github className="h-4 w-4" aria-hidden />
            GradeDescent
          </a>
          <a
            className="flex items-center gap-2 hover:text-foreground"
            href="https://x.com/gradedescent"
            target="_blank"
            rel="noreferrer"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 1200 1227"
              aria-hidden
              role="img"
            >
              <path
                d="M714.7 519.2 1158 0H1056L663.8 454.6 349.1 0H0l465.6 678.1L0 1227h102.1l409.7-474.6L850.9 1227H1200L714.7 519.2Zm-144.1 167.1-45.7-65.4L161.7 91h142.1l293.1 419.7 45.7 65.4 381 545.3H881.5L570.6 686.3Z"
                fill="currentColor"
              />
            </svg>
            @GradeDescent
          </a>
          <a
            className="flex items-center gap-2 hover:text-foreground"
            href="https://bsky.app/profile/gradedescent.com"
            target="_blank"
            rel="noreferrer"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              aria-hidden
              role="img"
            >
              <path d="M3.468 1.948C5.303 3.325 7.276 6.118 8 7.616c.725-1.498 2.698-4.29 4.532-5.668C13.855.955 16 .186 16 2.632c0 .489-.28 4.105-.444 4.692-.572 2.04-2.653 2.561-4.504 2.246 3.236.551 4.06 2.375 2.281 4.2-3.376 3.464-4.852-.87-5.23-1.98-.07-.204-.103-.3-.103-.218 0-.081-.033.014-.102.218-.379 1.11-1.855 5.444-5.231 1.98-1.778-1.825-.955-3.65 2.28-4.2-1.85.315-3.932-.205-4.503-2.246C.28 6.737 0 3.12 0 2.632 0 .186 2.145.955 3.468 1.948" fill="currentColor"
              />
            </svg>
            @GradeDescent.com
          </a>
        </div>
      </div>
    </footer>
  );
}
