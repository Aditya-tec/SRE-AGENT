import './globals.css';
import MadeBy from '../components/MadeBy';

export const metadata = {
  title: 'Autonomous SRE Agent',
  description: 'A self-healing distributed system — detect, diagnose, remediate, all on its own.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-page text-ink-primary antialiased">
        <div className="flex-1">{children}</div>
        <MadeBy />
      </body>
    </html>
  );
}
