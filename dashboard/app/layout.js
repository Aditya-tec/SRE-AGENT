import './globals.css';

export const metadata = {
  title: 'Autonomous SRE Agent',
  description: 'A self-healing distributed system — detect, diagnose, remediate, all on its own.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-page text-ink-primary antialiased">{children}</body>
    </html>
  );
}
