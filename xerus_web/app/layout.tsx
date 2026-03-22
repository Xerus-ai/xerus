import './globals.css'
import AppLayout from '@/components/layout/AppLayout'
import { Toaster } from 'sonner'

export const metadata = {
  title: 'Xerus - AI Agents',
  description: 'Personalized AI Agents for various contexts',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* Playfair Display from Google Fonts (serif headings) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
        {/* Other fonts (Inter, Lora) loaded via self-hosted WOFF files in globals.css */}
      </head>
      <body>
        <AppLayout>
          {children}
        </AppLayout>
        <Toaster
          position="bottom-right"
          gap={12}
          toastOptions={{
            unstyled: true,
            classNames: {
              toast: 'flex items-start gap-3 p-4 rounded-2xl shadow-lg border max-w-sm font-sans backdrop-blur-sm',
              title: 'text-sm font-medium leading-snug',
              description: 'text-xs text-text-secondary mt-0.5',
              icon: 'w-5 h-5 shrink-0 mt-0.5',
              success: 'bg-[#FFF4E6]/95 border-[#FF6600]/20 text-text [&_svg]:text-[#FF6600]',
              error: 'bg-red-50/95 border-red-200 text-red-900 [&_svg]:text-red-500',
              warning: 'bg-amber-50/95 border-amber-200 text-amber-900 [&_svg]:text-amber-500',
              info: 'bg-surface/95 border-surface-active text-text [&_svg]:text-[#FF6600]',
              closeButton: 'absolute top-2 right-2 p-1 rounded-lg hover:bg-black/5 text-current opacity-50 hover:opacity-100 transition-opacity',
            },
          }}
          closeButton
        />
      </body>
    </html>
  )
}