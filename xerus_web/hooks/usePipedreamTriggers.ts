import { useState, useEffect } from 'react'
import { apiCall } from '@/lib/api/client'

interface Trigger {
    key: string
    name: string
    description: string
}

export function usePipedreamTriggers(appSlug?: string) {
    const [triggers, setTriggers] = useState<Trigger[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!appSlug) {
            setTriggers([])
            return
        }

        const fetchTriggers = async () => {
            try {
                setLoading(true)
                setError(null)

                const response = await apiCall(`/tools/triggers/${appSlug}`)
                const result = await response.json()

                setTriggers(result.data?.actions || result.actions || [])
            } catch (err) {
                console.error('Failed to fetch triggers:', err)
                setError(err instanceof Error ? err.message : 'Failed to fetch triggers')
                setTriggers([])
            } finally {
                setLoading(false)
            }
        }

        fetchTriggers()
    }, [appSlug])

    return { triggers, loading, error }
}
