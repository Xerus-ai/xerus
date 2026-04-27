'use client'

import { motion } from 'framer-motion'
import { Coins } from 'lucide-react'
import { cn } from '@/lib/utils'
import { easeOutQuart } from '@/lib/motion'

const CREDIT_PACKS = [
  { credits: 500 as const, price: 5, label: 'Starter' },
  { credits: 2000 as const, price: 18, label: 'Popular' },
  { credits: 5000 as const, price: 40, label: 'Best value' },
]

interface CreditTopupSectionProps {
  onPurchase: (credits: 500 | 2000 | 5000) => void
  loadingCredits: number | null
}

export function CreditTopupSection({ onPurchase, loadingCredits }: CreditTopupSectionProps) {
  return (
    <motion.div
      className="mt-14"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.3, ease: easeOutQuart }}
    >
      <div className="flex items-center gap-2 mb-5">
        <Coins className="w-4 h-4 text-text-secondary" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Credit Top-ups
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {CREDIT_PACKS.map((pack, index) => {
          const isMiddle = index === 1
          return (
            <motion.button
              key={pack.credits}
              onClick={() => onPurchase(pack.credits)}
              disabled={loadingCredits === pack.credits}
              className={cn(
                'rounded-2xl border p-5 text-left transition-all duration-200 disabled:opacity-50',
                isMiddle
                  ? 'bg-surface/80 border-primary/20 shadow-sm hover:shadow-md'
                  : 'bg-surface/60 border-surface-active/60 hover:border-primary/30 hover:shadow-sm'
              )}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.34 + index * 0.06, ease: easeOutQuart }}
              whileHover={{ y: -2, transition: { duration: 0.2, ease: easeOutQuart } }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center justify-between mb-1">
                <p className={cn(
                  'text-lg font-semibold text-text',
                  isMiddle && 'text-[19px]'
                )}>
                  {pack.credits.toLocaleString()}
                </p>
                {isMiddle && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-primary bg-primary/8 px-2 py-0.5 rounded-full">
                    {pack.label}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-text-secondary mb-3">credits</p>
              <p className="text-2xl font-semibold text-text">${pack.price}</p>
              <p className="text-xs text-text-secondary mt-2">
                {loadingCredits === pack.credits ? 'Redirecting...' : 'One-time purchase'}
              </p>
            </motion.button>
          )
        })}
      </div>
    </motion.div>
  )
}
