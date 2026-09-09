import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentIndex — trust layer for the agent economy',
  description:
    'Trust scores for x402 services, earned by real paid probes and recorded on-chain.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
