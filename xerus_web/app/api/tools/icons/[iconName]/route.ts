import { NextRequest, NextResponse } from 'next/server'

// Generate static params for known icon names (required for static export)
export async function generateStaticParams() {
  // List of known icon files that might be requested
  const iconNames = [
    'gmail_new_logo_icon.png',
    'GitHub-logo-768x432.png', 
    'weather_logo.png',
    'Google-Calendar-Logo.png',
    'atlassian-logo.png',
    'firecrawl_logo.png',
    'tavily-color.png'
  ]
  
  return iconNames.map((iconName) => ({
    iconName: iconName
  }))
}

export async function GET(
  request: NextRequest,
  { params }: { params: { iconName: string } }
) {
  try {
    const { iconName } = params
    
    // Get the backend URL from runtime config or environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api'
    const iconUrl = `${backendUrl}/v1/tools/icons/${iconName}`
    
    // Fetch the icon from the backend
    const response = await fetch(iconUrl, {
      headers: {
        'Authorization': 'Bearer development_token',
        'X-User-ID': 'admin_user'
      }
    })
    
    if (!response.ok) {
      return NextResponse.json({ error: 'Icon not found' }, { status: 404 })
    }
    
    // Get the image data
    const imageBuffer = await response.arrayBuffer()
    
    // Determine content type based on file extension
    const contentType = iconName.endsWith('.svg') ? 'image/svg+xml' :
                       iconName.endsWith('.png') ? 'image/png' :
                       iconName.endsWith('.jpg') || iconName.endsWith('.jpeg') ? 'image/jpeg' :
                       'image/png' // default
    
    // Return the image with proper headers
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // 24 hours cache
      }
    })
  } catch (error) {
    console.error('Error proxying icon:', error)
    return NextResponse.json({ error: 'Failed to load icon' }, { status: 500 })
  }
}