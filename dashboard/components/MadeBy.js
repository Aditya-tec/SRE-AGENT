const LINKS = [
  { href: 'https://github.com/Aditya-tec/SRE-AGENT', label: 'GitHub' },
  { href: 'https://www.linkedin.com/in/adiikalambe/', label: 'LinkedIn' },
  { href: 'https://www.adityakalambe.xyz/', label: 'Portfolio' },
];

export default function MadeBy() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-xs text-ink-muted sm:flex-row">
        <p>
          Made by{' '}
          <a
            href="https://www.adityakalambe.xyz/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-secondary transition-colors hover:text-accent"
          >
            Aditya Kalambe
          </a>
        </p>
        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {LINKS.map((link, i) => (
            <span key={link.href} className="inline-flex items-center gap-3">
              {i > 0 && (
                <span className="text-ink-muted/40" aria-hidden="true">
                  ·
                </span>
              )}
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-accent"
              >
                {link.label}
              </a>
            </span>
          ))}
        </p>
      </div>
    </footer>
  );
}
