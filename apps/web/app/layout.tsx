import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    template: '%s | DigitalDepot',
    default: 'DigitalDepot',
  },
  description: 'Electronics & Consumer Technology Store',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
