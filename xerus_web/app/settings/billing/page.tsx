'use client'

import { useEffect, useState } from 'react'
import { useRedirectIfNotAuth } from '@/utils/auth'
import { checkApiKeyStatus } from '@/utils/api'
import { Check, Cpu, Shield, Key, Zap } from 'lucide-react'

export default function BillingPage() {
  const userInfo = useRedirectIfNotAuth()
  const [hasAnyApiKey, setHasAnyApiKey] = useState<boolean | null>(null)

  useEffect(() => {
    let isMounted = true
    ;(async () => {
      try {
        const status = await checkApiKeyStatus()
        const anyKey = Object.values(status).some(Boolean)
        if (isMounted) setHasAnyApiKey(anyKey)
      } catch (e) {
        if (isMounted) setHasAnyApiKey(null)
      }
    })()
    return () => {
      isMounted = false
    }
  }, [])

  if (!userInfo) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'profile', name: 'Personal profile', href: '/settings' },
    { id: 'privacy', name: 'Data & privacy', href: '/settings/privacy' },
    { id: 'billing', name: 'Billing', href: '/settings/billing' },
    { id: 'models', name: 'AI Models', href: '/settings/models' },
  ]

  return (
    <div className="min-h-screen">
      <div className="px-8 py-8">
        <div className="mb-6">
          <p className="text-xs text-gray-500 mb-1">Settings</p>
          <h1 className="text-3xl font-bold text-gray-900">Personal settings</h1>
        </div>

        <div className="mb-8">
          <nav className="flex space-x-10">
            {tabs.map((tab) => (
              <a
                key={tab.id}
                href={tab.href}
                className={`pb-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                  tab.id === 'billing'
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.name}
              </a>
            ))}
          </nav>
        </div>

        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-b from-white to-[#fff6ec] p-8 mb-10">
          <div className="relative z-10 flex flex-col items-start gap-3">
            <span className="inline-flex items-center rounded-full bg-orange-100 text-orange-700 px-3 py-1 text-xs font-medium">
              Simple pricing
            </span>
            <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 tracking-tight">Use Xerus your way</h2>
            <p className="text-gray-600 max-w-2xl">
              Local is always free. Cloud is free when you bring your own API keys. No keys yet? We include 50 starter credits so you can try everything.
            </p>
          </div>
          <div className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-orange-200 opacity-40 blur-3xl" />
        </div>

        {/* Pricing Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Local plan */}
          <div className="relative rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Local</h3>
                <p className="text-sm text-gray-500">Runs fully on your machine</p>
              </div>
            </div>

            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-3xl font-semibold text-gray-900">Free</span>
            </div>

            <ul className="space-y-3 mb-6">
              <li className="flex items-start gap-3 text-sm text-gray-700">
                <Check className="h-5 w-5 text-green-600 shrink-0" />
                Use local models (e.g., Ollama) with zero cost
              </li>
              <li className="flex items-start gap-3 text-sm text-gray-700">
                <Check className="h-5 w-5 text-green-600 shrink-0" />
                Works offline, private by design
              </li>
              <li className="flex items-start gap-3 text-sm text-gray-700">
                <Check className="h-5 w-5 text-green-600 shrink-0" />
                All features that support local execution
              </li>
            </ul>

            <a href="/setup" className="inline-flex items-center justify-center rounded-md bg-orange-500 px-4 py-2 text-white text-sm font-medium hover:bg-orange-600 transition-colors">
              Set up local
            </a>
          </div>

          {/* Cloud plan */}
          <div className="relative rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="absolute right-4 top-4">
              {hasAnyApiKey === null ? (
                <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 px-2.5 py-1 text-xs">Checking…</span>
              ) : hasAnyApiKey ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2.5 py-1 text-xs">
                  <Key className="h-3.5 w-3.5" /> Keys connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-700 px-2.5 py-1 text-xs">
                  <Zap className="h-3.5 w-3.5" /> 50 credits included
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Cloud</h3>
                <p className="text-sm text-gray-500">Logged-in experience</p>
              </div>
            </div>

            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-3xl font-semibold text-gray-900">Free</span>
              <span className="text-sm text-gray-500">with your own keys</span>
            </div>

            <ul className="space-y-3 mb-6">
              <li className="flex items-start gap-3 text-sm text-gray-700">
                <Check className="h-5 w-5 text-green-600 shrink-0" />
                Bring your own provider keys and pay providers directly
              </li>
              <li className="flex items-start gap-3 text-sm text-gray-700">
                <Check className="h-5 w-5 text-green-600 shrink-0" />
                No keys yet? Start with 50 free credits
              </li>
              <li className="flex items-start gap-3 text-sm text-gray-700">
                <Check className="h-5 w-5 text-green-600 shrink-0" />
                Access advanced cloud-only features
              </li>
            </ul>

            <div className="flex flex-wrap gap-3">
              <a href="/settings/models" className="inline-flex items-center justify-center rounded-md bg-orange-500 px-4 py-2 text-white text-sm font-medium hover:bg-orange-600 transition-colors">
                Manage API keys
              </a>
              {!hasAnyApiKey && (
                <a href="/ai-agents" className="inline-flex items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors">
                  Use starter credits
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}