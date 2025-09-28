'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, Lock } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface GuestLoginPromptProps {
  feature?: string
  description?: string
  allowedFeatures?: string[]
}

export default function GuestLoginPrompt({
  feature = 'This feature',
  description = 'Sign in to access all features and save your data across devices.',
  allowedFeatures = []
}: GuestLoginPromptProps) {
  const router = useRouter()

  return (
    <div className="flex items-center justify-center min-h-[600px] p-8">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">{feature} requires sign in</CardTitle>
          <CardDescription className="mt-2">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {allowedFeatures.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Available in guest mode:</p>
              <ul className="space-y-1">
                {allowedFeatures.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="space-y-2 pt-4">
            <Button 
              onClick={() => router.push('/login')}
              className="w-full"
              size="lg"
            >
              Sign In
            </Button>
            <Button 
              onClick={() => router.push('/login')}
              variant="outline"
              className="w-full"
              size="lg"
            >
              Create Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
