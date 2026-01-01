import { Github } from 'lucide-react';

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-background/70 text-muted-foreground/80">
      <div className="mx-auto grid max-w-5xl gap-6 px-6 py-6 text-xs md:grid-cols-[1.2fr_0.8fr] md:items-start">
        <div className="space-y-3">
          <p>
            © {year},{' '}
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
            GitHub
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
              viewBox="0 0 600 530"
              aria-hidden
              role="img"
            >
              <path
                d="M103.5 39.8C181.2 97.2 262.7 214.9 300 262.9c37.3-48 118.8-165.7 196.5-223.1C552.8-3.8 600 21.1 600 99.1c0 16.6-9.5 139.6-15.1 159.6-19.7 70.1-91.2 88.2-155 77.6 114.4 19.5 143.5 81.6 80.4 147.2-119.8-123-172.4-12.8-186.8 22.2-2.5 6.6-3.6 9.7-6.5 9.7s-4-3.1-6.5-9.7c-14.4-35-67-145.2-186.8-22.2-63.1-65.6-34-127.7 80.4-147.2-63.8 10.6-135.3-7.5-155-77.6C9.5 238.7 0 115.7 0 99.1 0 21.1 47.2-3.8 103.5 39.8Z"
                fill="currentColor"
              />
            </svg>
            @GradeDescent.com
          </a>
        </div>
      </div>
    </footer>
  );
}
