import { useState, useEffect } from 'react'
import { apiCall } from '@/lib/api'

interface Action {
    key: string
    name: string
    description: string
}

export function usePipedreamActions(appSlug?: string) {
    const [actions, setActions] = useState<Action[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!appSlug) {
            setActions([])
            return
        }

        const fetchActions = async () => {
            try {
                setLoading(true)
                setError(null)

                const response = await apiCall(`/tools/actions/${appSlug}`)
                const result = await response.json()

                setActions(result.data?.actions || result.actions || [])
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch actions')
                setActions([])
            } finally {
                setLoading(false)
            }
        }

        fetchActions()
    }, [appSlug])

    return { actions, loading, error }
}
