import type { Metadata, Viewport } from 'next';
import { AuthGate } from '@/components/AuthGate';
import { DrawerProvider } from '@/components/DrawerContext';
import { NavShell } from '@/components/NavShell';
import { RegisterServiceWorker } from '@/components/RegisterServiceWorker';
import './globals.css';

export const metadata: Metadata = {
  title: 'My OS',
  description: 'Personal life-management: capture tasks and projects instantly.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'My OS',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#111318' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RegisterServiceWorker />
        <AuthGate>
          <DrawerProvider>
            <NavShell>{children}</NavShell>
          </DrawerProvider>
        </AuthGate>
      </body>
    </html>
  );
}
