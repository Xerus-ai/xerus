import { Check, MessageSquare, Clock, Database, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PricingLimit {
    icon: React.ElementType
    text: string
}

export interface PricingPlan {
    id: string
    name: string
    description: string
    price: {
        monthly: number
        yearly: number
    }
    limits: PricingLimit[]
    features: string[]
    isHighlighted?: boolean
    buttonText?: string
    popular?: boolean
}

interface PricingCardProps {
    plan: PricingPlan
    billingCycle: 'monthly' | 'yearly'
    onSelect: (planId: string) => void
    isLoading?: boolean
}

export function PricingCard({ plan, billingCycle, onSelect, isLoading }: PricingCardProps) {
    const price = billingCycle === 'monthly' ? plan.price.monthly : plan.price.yearly
    const isHighlighted = plan.isHighlighted

    return (
        <div
            className={cn(
                "relative flex flex-col p-8 transition-all duration-300 h-full",
                "bg-surface text-text",
                "rounded-[20px]",
                "border border-transparent",
                isHighlighted && "shadow-sm"
            )}
        >
            {/* Most Popular Badge */}
            {plan.popular && (
                <span className="absolute -top-3 right-6 bg-[#FF6600] text-white text-[10px] uppercase font-bold px-3 py-1 rounded-full tracking-wide">
                    Most Popular
                </span>
            )}

            {/* Plan Name */}
            <h3 className="font-serif text-2xl font-normal mb-2 text-text">
                {plan.name}
            </h3>

            {/* Price */}
            <div className="flex items-baseline gap-1 mb-4">
                <span className="text-[48px] font-semibold leading-none font-sans">${price}</span>
                <span className="text-base text-text-secondary font-sans">
                    /per month
                </span>
            </div>

            {/* Description */}
            <p className="text-[15px] leading-relaxed text-text-secondary mb-8 font-sans min-h-[48px]">
                {plan.description}
            </p>

            {/* Limits Section */}
            <div className="space-y-4 mb-8">
                {plan.limits.map((limit, index) => (
                    <div key={index} className="flex items-center gap-3">
                        <limit.icon className="w-[18px] h-[18px] shrink-0 text-text-secondary stroke-[1.5px]" />
                        <span className="text-[15px] text-text-secondary font-sans">
                            {limit.text}
                        </span>
                    </div>
                ))}
            </div>

            {/* Button */}
            <button
                onClick={() => onSelect(plan.id)}
                disabled={isLoading}
                className={cn(
                    "w-full h-[52px] rounded-full font-medium transition-all duration-200 mb-10 font-sans text-[16px]",
                    isHighlighted
                        ? "bg-[#FF6600] text-white hover:bg-[#e55c00] shadow-sm"
                        : "bg-[#EEE8E1] text-text hover:bg-[#e0d8cf]"
                )}
            >
                {plan.buttonText || "Get Started"}
            </button>

            {/* Features Section */}
            <div className="flex-grow">
                <ul className="space-y-3">
                    {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-start gap-3">
                            <Check className={cn(
                                "w-4 h-4 shrink-0 mt-0.5",
                                isHighlighted ? "text-[#FF6600]" : "text-text-secondary"
                            )} />
                            <span className="text-[14px] leading-tight text-text-secondary font-sans">
                                {feature}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}
