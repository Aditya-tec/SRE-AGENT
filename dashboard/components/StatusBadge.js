const TONE_STYLES = {
  good: { color: 'var(--status-good)', bg: 'rgba(12,163,12,0.14)', icon: '✓' },
  warning: { color: 'var(--status-warning)', bg: 'rgba(250,178,25,0.14)', icon: '●' },
  serious: { color: 'var(--status-serious)', bg: 'rgba(236,131,90,0.14)', icon: '▲' },
  critical: { color: 'var(--status-critical)', bg: 'rgba(208,59,59,0.14)', icon: '✕' },
};

// Status is never color-alone: each tone gets a distinct icon shape
// too, so it still reads correctly for colorblind viewers.
export default function StatusBadge({ tone, label }) {
  const style = TONE_STYLES[tone] || TONE_STYLES.warning;
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color: style.color, backgroundColor: style.bg }}
    >
      <span aria-hidden="true">{style.icon}</span>
      {label}
    </span>
  );
}
