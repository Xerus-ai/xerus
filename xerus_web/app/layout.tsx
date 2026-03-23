import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Playfair_Display } from 'next/font/google'
import AppLayout from '@/components/layout/AppLayout'
import { Toaster } from 'sonner'

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-playfair',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FF6600',
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
    <html lang="en" className={playfair.variable}>
      <body>
        <AppLayout>
          {children}
        </AppLayout>
        <Toaster
          position="top-right"
          gap={10}
          toastOptions={{
            unstyled: true,
            duration: 6000,
            classNames: {
              toast: 'flex items-center gap-3 pl-3 pr-2 py-2.5 rounded-[18px] shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-surface-active/60 max-w-[26rem] font-sans bg-white/95 backdrop-blur-sm transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.16)]',
              title: 'text-sm font-semibold text-text leading-none',
              description: 'text-xs text-text-muted font-medium leading-tight mt-0.5',
              icon: 'shrink-0 w-7 h-7 rounded-full flex items-center justify-center ring-4 ring-white [&_svg]:w-3.5 [&_svg]:h-3.5 [&_svg]:stroke-[2.5]',
              actionButton: 'text-[0.7rem] font-semibold px-2.5 py-1 rounded-md bg-[#1a1a1a] text-white border-transparent hover:bg-black transition-all',
              cancelButton: 'text-[0.7rem] font-semibold px-2.5 py-1 rounded-md bg-white text-text border border-surface-active hover:bg-surface-hover transition-all',
              closeButton: 'shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-surface-hover/80 border border-transparent hover:border-surface-active transition-all',
              success: '[&>[data-icon]]:bg-emerald-50 [&>[data-icon]_svg]:text-emerald-600',
              error: '[&>[data-icon]]:bg-red-50 [&>[data-icon]_svg]:text-red-600',
              warning: '[&>[data-icon]]:bg-amber-50 [&>[data-icon]_svg]:text-amber-600',
              info: '[&>[data-icon]]:bg-indigo-50 [&>[data-icon]_svg]:text-indigo-600',
            },
          }}
          closeButton
        />
      </body>
    </html>
  )
}