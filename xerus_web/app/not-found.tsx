import Link from 'next/link'
import Image from 'next/image'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
      <Image
        src="/logo/xerus.svg"
        alt="Xerus"
        width={48}
        height={48}
        className="opacity-40"
      />
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-serif text-text">404</h1>
        <p className="text-text-secondary">This page doesn't exist.</p>
      </div>
      <Link
        href="/"
        className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl transition-colors"
      >
        Back to Home
      </Link>
    </div>
  )
}
