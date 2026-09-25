const LINKS = [
  { href: 'https://github.com/Aditya-tec/SRE-AGENT', label: 'GitHub' },
  { href: 'https://www.linkedin.com/in/adiikalambe/', label: 'LinkedIn' },
  { href: 'https://www.adityakalambe.xyz/', label: 'Portfolio' },
];

export default function MadeBy() {
  return (
    <footer className="mx-auto max-w-6xl border-t border-border px-4 py-6 text-center text-xs text-ink-muted">
      <p>
        Made by{' '}
        <a
          href="https://www.adityakalambe.xyz/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink-secondary hover:text-accent hover:underline"
        >
          Aditya Kalambe
        </a>
      </p>
      <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {LINKS.map((link, i) => (
          <span key={link.href} className="inline-flex items-center gap-3">
            {i > 0 && <span aria-hidden="true">·</span>}
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent hover:underline"
            >
              {link.label}
            </a>
          </span>
        ))}
      </p>
    </footer>
  );
}
