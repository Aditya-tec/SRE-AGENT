export default function Section({ id, title, description, meta, children, delay = 0 }) {
  return (
    <section id={id} className="animate-in scroll-mt-24" style={{ '--delay': `${delay}ms` }}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-2">
        <div>
          <h2 className="section-label">{title}</h2>
          {description && (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>
          )}
        </div>
        {meta != null && <div className="text-sm text-ink-muted">{meta}</div>}
      </div>
      {children}
    </section>
  );
}
