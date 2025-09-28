'use client'

import { useState } from 'react'
import { Page, PageHeader } from '@/components/Page'

// Test OAuth provider configurations
const oauthProviderConfigs: { [key: string]: {
  displayName: string
  description: string
  fields: {
    clientId: { label: string; placeholder: string }
    clientSecret: { label: string; placeholder: string }
    additionalField?: { label: string; placeholder: string; description: string }
  }
  scopes: string
  helpText: string
  docsUrl: string
}} = {
  'atlassian-remote': {
    displayName: 'Atlassian',
    description: 'This gives you maximum privacy and control over your Atlassian data.',
    fields: {
      clientId: { 
        label: 'Client ID', 
        placeholder: 'Your Atlassian OAuth Client ID' 
      },
      clientSecret: { 
        label: 'Client Secret', 
        placeholder: 'Your Atlassian OAuth Client Secret' 
      },
      additionalField: { 
        label: 'Cloud ID (Optional)', 
        placeholder: 'Your Atlassian Cloud ID (if specific site)',
        description: 'Optional - leave blank for multi-tenant access'
      }
    },
    scopes: 'read:jira-user read:jira-work write:jira-work',
    helpText: 'Visit the Atlassian Developer Console to create your OAuth app.',
    docsUrl: 'https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/'
  }
}

export default function TestPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) {
    return <div>Loading...</div>
  }

  if (error) {
    return <div>Error: {error}</div>
  }

  return (
    <Page>
      <PageHeader title="Test Page" description="Test syntax" />
      <div>Test content</div>
    </Page>
  )
}