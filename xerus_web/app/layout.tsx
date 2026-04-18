import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Playfair_Display } from 'next/font/google'
import { ThemeProvider } from '@/components/ThemeProvider'
import AppLayout from '@/components/layout/AppLayout'
import { NotificationProvider } from '@/components/ui/NotificationProvider'

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-playfair',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f2f1ed',
}

export const metadata: Metadata = {
  title: 'Xerus - AI Agents',
  description: 'Build your own AI workforce. Personalized AI agents that work together in your workspace.',
  icons: {
    icon: '/logo/xerus.svg',
    apple: '/logo/xerus.svg',
  },
  openGraph: {
    title: 'Xerus - AI Agents',
    description: 'Build your own AI workforce. Personalized AI agents that work together in your workspace.',
    url: 'https://app.xerus.ai',
    siteName: 'Xerus',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Xerus - AI Agents',
    description: 'Build your own AI workforce. Personalized AI agents that work together in your workspace.',
  },
  metadataBase: new URL('https://app.xerus.ai'),
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={playfair.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AppLayout>
            {children}
          </AppLayout>
          <NotificationProvider />
        </ThemeProvider>
      </body>
    </html>
  )
}
