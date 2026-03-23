import { useState } from 'react'
import { Tool } from "@/types/tool"
import { apiCall } from "@/lib/api/client"
import { getSharedPipedreamClient } from '@/lib/pipedream-client'
import { toast } from 'sonner'

export function useToolAuth(refetch: () => void) {
    const [configuringAuth, setConfiguringAuth] = useState<string | null>(null)

    const handleAuthConfigure = async (tool: Tool) => {
        const toolIdentifier = tool.mcp_server ? tool.mcp_server_id : tool.tool_name || tool.name

        if (!toolIdentifier) {
            return
        }

        if (tool.auth_type === 'oauth' || tool.auth_type === 'keys') {
            try {
                setConfiguringAuth(toolIdentifier)

                if (tool.is_configured && tool.connected_account_ids && tool.connected_account_ids.length > 0) {
                    await Promise.allSettled(
                        tool.connected_account_ids.map(accountId =>
                            apiCall(`/tools/accounts/${accountId}`, { method: 'DELETE' })
                        )
                    )

                    await new Promise(resolve => setTimeout(resolve, 500))
                }

                const pipedreamClient = getSharedPipedreamClient()

                pipedreamClient.connectAccount({
                    app: toolIdentifier,
                    onSuccess: async (_res) => {
                        setConfiguringAuth(null)

                        const iframes = document.querySelectorAll('iframe[id^="pipedream-connect-iframe-"]')
                        iframes.forEach(iframe => iframe.remove())

                        await new Promise(resolve => setTimeout(resolve, 1000))
                        refetch()
                    },
                    onError: (err) => {
                        setConfiguringAuth(null)

                        const iframes = document.querySelectorAll('iframe[id^="pipedream-connect-iframe-"]')
                        iframes.forEach(iframe => iframe.remove())

                        toast.error("Connection failed", { description: 'Please close and try again.' })
                    },
                    onClose: (_status) => {
                        setConfiguringAuth(null)

                        const iframes = document.querySelectorAll('iframe[id^="pipedream-connect-iframe-"]')
                        iframes.forEach(iframe => iframe.remove())
                    }
                })
            } catch (err) {
                toast.error("Couldn't connect the app", { description: 'Please try again or check your permissions.' })
                setConfiguringAuth(null)
            }
        } else if (!tool.auth_type || tool.auth_type === 'none') {
            toast.info('This tool does not require authentication')
        } else {
            toast.error("This tool's login type isn't supported yet")
        }
    }

    const handleDisconnect = async (tool: Tool) => {
        const toolIdentifier = tool.mcp_server ? tool.mcp_server_id ?? tool.name : tool.tool_name || tool.name

        if (!tool.connected_account_ids || tool.connected_account_ids.length === 0) {
            toast.error("This tool isn't connected yet")
            return
        }

        const accountCount = tool.connected_account_ids.length

        try {
            setConfiguringAuth(toolIdentifier)

            const results = await Promise.allSettled(
                tool.connected_account_ids.map(accountId =>
                    apiCall(`/tools/accounts/${accountId}`, { method: 'DELETE' })
                )
            )

            const failures = results.filter(r => r.status === 'rejected')
            const successes = results.filter(r => r.status === 'fulfilled')

            if (failures.length > 0 && successes.length === 0) {
                throw new Error(`Failed to disconnect all ${accountCount} account${accountCount > 1 ? 's' : ''}`)
            } else if (failures.length > 0) {
                toast.warning("Some accounts couldn't be disconnected", { description: 'Please try the remaining ones again.' })
                await new Promise(resolve => setTimeout(resolve, 500))
                refetch()
            } else {
                toast.success('App disconnected')
                await new Promise(resolve => setTimeout(resolve, 500))
                refetch()
            }
        } catch (err) {
            toast.error("Couldn't disconnect the app", { description: 'Please try again.' })
        } finally {
            setConfiguringAuth(null)
        }
    }

    return {
        configuringAuth,
        setConfiguringAuth,
        handleAuthConfigure,
        handleDisconnect
    }
}
