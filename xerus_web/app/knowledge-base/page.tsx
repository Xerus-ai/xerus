'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, AlertCircle, CheckCircle, X } from 'lucide-react'
import { 
  Search,
  Upload,
  FolderOpen,
  FileText,
  Calendar,
  Database,
  Settings,
  Download,
  Eye,
  MoreHorizontal,
  Plus,
  Trash2,
  RefreshCw,
  Move,
  FolderInput,
  Check,
  Square
} from 'lucide-react'
import { getApiHeaders, createKnowledgeFolder } from '@/utils/api'
import { Page, PageHeader } from '@/components/Page'
import GuestGate from '@/components/GuestGate'

interface KnowledgeDocument {
  id: string
  title: string
  content: string
  excerpt: string
  content_type: string
  source_url?: string
  file_path?: string
  tags: string[]
  metadata: any
  is_indexed: boolean
  index_status: string
  word_count: number
  character_count: number
  created_at: string
  updated_at: string
  folder_id?: string | null
  folder_name?: string
  folder_color?: string
}

interface Folder {
  id: string
  name: string
  parent_id?: string | null
  color: string
  icon_emoji: string
  description?: string
  document_count: number
  total_words: number
  created_at: string
  updated_at: string
}

interface UploadStatus {
  file: File
  status: 'uploading' | 'success' | 'error'
  progress: number
  message?: string
}

// Helper function to get API base URL using runtime config
const getApiUrl = async () => {
  try {
    const response = await fetch('/runtime-config.json')
    if (response.ok) {
      const config = await response.json()
      return config.API_URL
    }
  } catch (error) {
    console.warn('Failed to fetch runtime config, using fallback')
  }
  return 'http://localhost:5001/api/v1' // Fallback - corrected port and path
}

export default function KnowledgeBasePage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  // Base dataset for current scope (root or selected folder) used for client-side filtering
  const [baseDocuments, setBaseDocuments] = useState<KnowledgeDocument[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [foldersLoading, setFoldersLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState<UploadStatus[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [folderNameError, setFolderNameError] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  // Inline new-folder UX
  const [isInlineNewFolder, setIsInlineNewFolder] = useState(false)
  const [inlineFolderName, setInlineFolderName] = useState('')
  const [inlineFolderError, setInlineFolderError] = useState('')
  const [isInlineCreating, setIsInlineCreating] = useState(false)
  const inlineInputRef = useRef<HTMLInputElement>(null)
  const [draggedDocument, setDraggedDocument] = useState<string | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([])
  const [showMoveDialog, setShowMoveDialog] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    fetchDocuments()
    fetchFolders()
  }, [selectedFolder]) // Refetch when folder selection changes

  const applyLocalFilter = (query: string, sourceDocs?: KnowledgeDocument[]) => {
    const src = sourceDocs ?? baseDocuments
    const q = query.trim().toLowerCase()
    if (!q) {
      setDocuments(src)
      return
    }
    setDocuments(
      src.filter((d) => {
        const fields = [
          d.title?.toLowerCase() || '',
          d.excerpt?.toLowerCase() || '',
          d.content_type?.toLowerCase() || '',
          (d.tags || []).join(' ').toLowerCase(),
        ]
        return fields.some((f) => f.includes(q))
      })
    )
  }

  const fetchDocuments = async () => {
    try {
      setLoading(true)
      const apiUrl = await getApiUrl()
      
      // Add folder filter if a folder is selected
      const folderParam = selectedFolder ? `?folder_id=${selectedFolder}` : ''
      
      const response = await fetch(`${apiUrl}/knowledge${folderParam}`, {
        headers: await getApiHeaders()
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch documents' }))
        throw new Error(errorData.message || 'Failed to fetch documents')
      }
      
      const documentsData = await response.json()
      
      // Map backend knowledge_base data to frontend KnowledgeDocument format
      const mappedDocuments = documentsData.map((doc: any) => ({
        id: doc.id?.toString() || doc.document_id,
        title: doc.title || doc.document_title || 'Untitled',
        content: doc.content || '',
        excerpt: doc.excerpt || doc.content?.substring(0, 200) || '',
        content_type: doc.content_type || 'text/plain',
        source_url: doc.source_url || null,
        file_path: doc.file_path || null,
        tags: doc.tags || [],
        metadata: doc.metadata || {},
        is_indexed: doc.is_indexed || false,
        index_status: doc.index_status || 'pending',
        word_count: doc.word_count || 0,
        character_count: doc.character_count || 0,
        created_at: doc.created_at || new Date().toISOString(),
        updated_at: doc.updated_at || doc.created_at || new Date().toISOString()
      }))
      
      setBaseDocuments(mappedDocuments)
      applyLocalFilter(searchQuery, mappedDocuments)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch documents')
    } finally {
      setLoading(false)
    }
  }

  const fetchFolders = async () => {
    try {
      setFoldersLoading(true)
      const apiUrl = await getApiUrl()
      const response = await fetch(`${apiUrl}/knowledge/folders?parent_id=null`, {
        headers: await getApiHeaders()
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch folders' }))
        throw new Error(errorData.message || 'Failed to fetch folders')
      }
      
      const foldersData = await response.json()
      setFolders(foldersData)
    } catch (err) {
      console.error('Failed to fetch folders:', err)
      // Don't set error for folders - just show empty folders list
    } finally {
      setFoldersLoading(false)
    }
  }

  const createFolder = async () => {
    if (!newFolderName.trim()) return

    setIsCreatingFolder(true)
    setFolderNameError('') // Clear any previous errors

    try {
      // For now, always create folders at root level (no parent) to avoid FK issues
      // TODO: Implement proper folder hierarchy once the basic system is stable
      const newFolder = await createKnowledgeFolder({
        name: newFolderName.trim()
        // parent_id omitted - will default to undefined (root level)
      })
      
      // Add the new folder to the list with required fields
      setFolders(prev => [...prev, {
        ...newFolder,
        document_count: 0,
        total_words: 0
      }])
      
      // Clear form and close dialog
      setNewFolderName('')
      setShowNewFolderDialog(false)
      setFolderNameError('')
      
      // Refresh the folder list to ensure consistency
      await fetchFolders()
      
      console.log('Folder created successfully:', newFolder.name)
      
    } catch (err) {
      console.error('Failed to create folder:', err)
      
      // Set inline error message based on error type
      if (err instanceof Error) {
        if (err.message.includes('already exists')) {
          setFolderNameError(`A folder named "${newFolderName.trim()}" already exists in this location.`)
        } else {
          setFolderNameError(`Failed to create folder: ${err.message}`)
        }
      } else {
        setFolderNameError('Failed to create folder. Please try again.')
      }
    } finally {
      setIsCreatingFolder(false)
    }
  }

  // Inline folder create flow
  const startInlineNewFolder = () => {
    if (isInlineNewFolder) return
    setIsInlineNewFolder(true)
    setInlineFolderName('')
    setInlineFolderError('')
    // Focus after render
    setTimeout(() => inlineInputRef.current?.focus(), 0)
  }

  const confirmInlineNewFolder = async () => {
    const name = inlineFolderName.trim()
    if (!name) {
      setInlineFolderError('Folder name is required')
      return
    }
    setIsInlineCreating(true)
    setInlineFolderError('')
    try {
      const newFolder = await createKnowledgeFolder({ name })
      setFolders(prev => [{
        ...newFolder,
        document_count: 0,
        total_words: 0,
      }, ...prev])
      setIsInlineNewFolder(false)
      setInlineFolderName('')
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('already exists')) {
          setInlineFolderError(`A folder named "${name}" already exists.`)
        } else {
          setInlineFolderError(err.message)
        }
      } else {
        setInlineFolderError('Failed to create folder. Please try again.')
      }
    } finally {
      setIsInlineCreating(false)
    }
  }

  const cancelInlineNewFolder = () => {
    if (isInlineCreating) return
    setIsInlineNewFolder(false)
    setInlineFolderName('')
    setInlineFolderError('')
  }

  const handleFileUpload = async (files: FileList) => {
    const newUploads: UploadStatus[] = Array.from(files).map(file => ({
      file,
      status: 'uploading' as const,
      progress: 0
    }))
    
    setUploadStatus(prev => [...prev, ...newUploads])

    for (const upload of newUploads) {
      try {
        const content = await readFileContent(upload.file)
        
        // Send JSON data instead of FormData to match backend expectations
        const documentData = {
          title: upload.file.name,
          content: content,
          content_type: getContentType(upload.file),
          tags: ['uploaded', getFileTypeTag(upload.file)],
          auto_index: true,
          enable_chunking: true,  // Enable intelligent chunking for better RAG precision
          metadata: {
            original_filename: upload.file.name,
            file_size: upload.file.size,
            upload_date: new Date().toISOString()
          }
        }
        
        const apiUrl = await getApiUrl()
        const headers = await getApiHeaders()
        
        const response = await fetch(`${apiUrl}/knowledge`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(documentData)
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Upload failed' }))
          throw new Error(errorData.message || 'Upload failed')
        }

        // Parse successful response
        const uploadedDocument = await response.json()
        console.log('Document uploaded successfully:', uploadedDocument)

        setUploadStatus(prev => prev.map(u => 
          u.file.name === upload.file.name 
            ? { ...u, status: 'success', progress: 100, message: 'Upload successful' }
            : u
        ))

        // Add document to the local state immediately for better UX
        const mappedDocument = {
          id: uploadedDocument.id?.toString() || uploadedDocument.document_id,
          title: uploadedDocument.title || upload.file.name,
          content: uploadedDocument.content || content,
          excerpt: uploadedDocument.excerpt || content.substring(0, 200),
          content_type: uploadedDocument.content_type || getContentType(upload.file),
          source_url: uploadedDocument.source_url || null,
          file_path: uploadedDocument.file_path || null,
          tags: uploadedDocument.tags || ['uploaded', getFileTypeTag(upload.file)],
          metadata: uploadedDocument.metadata || documentData.metadata,
          is_indexed: uploadedDocument.is_indexed || false,
          index_status: uploadedDocument.index_status || 'pending',
          word_count: uploadedDocument.word_count || 0,
          character_count: uploadedDocument.character_count || 0,
          created_at: uploadedDocument.created_at || new Date().toISOString(),
          updated_at: uploadedDocument.updated_at || new Date().toISOString()
        }

        // Add to documents state immediately
        setDocuments(prev => [mappedDocument, ...prev])

        // Also refresh documents list after a short delay to ensure backend consistency
        setTimeout(() => {
          fetchDocuments()
        }, 1000)
      } catch (err) {
        setUploadStatus(prev => prev.map(u => 
          u.file.name === upload.file.name 
            ? { ...u, status: 'error', progress: 0, message: err instanceof Error ? err.message : 'Upload failed' }
            : u
        ))
      }
    }

    // Clear upload status after 3 seconds
    setTimeout(() => {
      setUploadStatus([])
    }, 3000)
  }

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    })
  }

  const getContentType = (file: File): string => {
    const extension = file.name.split('.').pop()?.toLowerCase()
    const typeMap: { [key: string]: string } = {
      'txt': 'text',
      'md': 'markdown',
      'html': 'html',
      'pdf': 'pdf',
      'json': 'json'
    }
    return typeMap[extension || ''] || 'text'
  }

  const getFileTypeTag = (file: File): string => {
    const extension = file.name.split('.').pop()?.toLowerCase()
    return extension || 'unknown'
  }

  const isFileDragEvent = (e: React.DragEvent) => {
    try {
      const types = Array.from(e.dataTransfer?.types || [])
      return types.includes('Files')
    } catch {
      return false
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isFileDragEvent(e)) return
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files)
    }
  }

  const handleFileSelect = () => {
    fileInputRef.current?.click()
  }

  const deleteDocument = async (id: string) => {
    try {
      const apiUrl = await getApiUrl()
      const response = await fetch(`${apiUrl}/knowledge/${id}`, {
        method: 'DELETE',
        headers: await getApiHeaders()
      })
      
      if (!response.ok) throw new Error('Failed to delete document')
      
      setDocuments(prev => prev.filter(doc => doc.id !== id))
    } catch (err) {
      console.error('Failed to delete document:', err)
    }
  }

  const searchDocuments = async (query: string) => {
    if (!query.trim()) {
      fetchDocuments()
      return
    }
    
    try {
      const apiUrl = await getApiUrl()
      const response = await fetch(`${apiUrl}/knowledge/search`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(await getApiHeaders())
        },
        body: JSON.stringify({ query, limit: 50 })
      })
      
      if (!response.ok) throw new Error('Search failed')
      
      const result = await response.json()
      
      // Map search results to match document format
      const mappedResults = (result.results || []).map((doc: any) => ({
        id: doc.id?.toString() || doc.document_id,
        title: doc.title || doc.document_title || 'Untitled',
        content: doc.content || '',
        excerpt: doc.excerpt || doc.content?.substring(0, 200) || '',
        content_type: doc.content_type || 'text/plain',
        source_url: doc.source_url || null,
        file_path: doc.file_path || null,
        tags: doc.tags || [],
        metadata: doc.metadata || {},
        is_indexed: doc.is_indexed || false,
        index_status: doc.index_status || 'pending',
        word_count: doc.word_count || 0,
        character_count: doc.character_count || 0,
        created_at: doc.created_at || new Date().toISOString(),
        updated_at: doc.updated_at || doc.created_at || new Date().toISOString(),
        folder_id: doc.folder_id !== undefined ? (doc.folder_id === null ? null : doc.folder_id.toString()) : null,
        folder_name: doc.folder_name,
        folder_color: doc.folder_color,
      }))
      
      setDocuments(mappedResults)
    } catch (err) {
      console.error('Search failed:', err)
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    applyLocalFilter(searchQuery)
  }

  // File organization functions
  const updateFolderCountsOptimistically = (prevFolderId: string | null | undefined, nextFolderId: string | null) => {
    setFolders(prev => prev.map(f => {
      if (prevFolderId && f.id === prevFolderId) {
        return { ...f, document_count: Math.max(0, (f.document_count || 0) - 1) }
      }
      if (nextFolderId && f.id === nextFolderId) {
        return { ...f, document_count: (f.document_count || 0) + 1 }
      }
      return f
    }))
  }

  const moveDocumentToFolder = async (documentId: string, folderId: string | null) => {
    // optimistic local update first
    setDocuments(prevDocs => prevDocs.map(d => {
      if (d.id === documentId) {
        const prevFolderId = (d as any).folder_id ?? null
        updateFolderCountsOptimistically(prevFolderId, folderId)
        return { ...(d as any), folder_id: folderId }
      }
      return d
    }))

    // If viewing a specific folder, hide the doc if it moved away
    if (selectedFolder) {
      setDocuments(prev => prev.filter(d => ((d as any).folder_id ?? null) === selectedFolder))
    }

    try {
      const apiUrl = await getApiUrl()
      const response = await fetch(`${apiUrl}/knowledge/${documentId}/move`, {
        method: 'POST',
        headers: await getApiHeaders(),
        body: JSON.stringify({ folder_id: folderId })
      })

      if (!response.ok) throw new Error('Failed to move document')
    } catch (err) {
      console.error('Failed to move document:', err)
      // fallback to full refresh on error to resync
      fetchDocuments()
    }
  }

  const handleDocumentDragStart = (e: React.DragEvent, documentId: string) => {
    setDraggedDocument(documentId)
    e.dataTransfer.setData('text/plain', documentId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleFolderDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverFolder(folderId)
  }

  const handleFolderDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOverFolder(null)
  }

  const handleFolderDrop = async (e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    setDragOverFolder(null)

    const documentId = e.dataTransfer.getData('text/plain')
    if (documentId && documentId !== folderId) {
      await moveDocumentToFolder(documentId, folderId)
      setDraggedDocument(null)
    }
  }

  const toggleDocumentSelection = (documentId: string) => {
    setSelectedDocuments(prev => 
      prev.includes(documentId) 
        ? prev.filter(id => id !== documentId)
        : [...prev, documentId]
    )
  }

  const bulkMoveDocuments = async (folderId: string | null) => {
    // optimistic apply first
    setDocuments(prevDocs => prevDocs.map(d => selectedDocuments.includes(d.id)
      ? ({ ...(d as any), folder_id: folderId })
      : d
    ))

    if (selectedFolder) {
      setDocuments(prev => prev.filter(d => ((d as any).folder_id ?? null) === selectedFolder))
    }

    try {
      for (const documentId of selectedDocuments) {
        try {
          await moveDocumentToFolder(documentId, folderId)
        } catch {}
      }
      setSelectedDocuments([])
      setShowMoveDialog(false)
    } catch (err) {
      console.error('Failed to bulk move documents:', err)
      fetchDocuments()
    }
  }

  // Helper functions for folder styling
  const getFolderColor = (color: string) => {
    const colorMap: { [key: string]: { bg: string; text: string } } = {
      blue: { bg: 'bg-blue-100', text: 'text-blue-800' },
      green: { bg: 'bg-green-100', text: 'text-green-800' },
      purple: { bg: 'bg-purple-100', text: 'text-purple-800' },
      orange: { bg: 'bg-orange-100', text: 'text-orange-800' },
      red: { bg: 'bg-red-100', text: 'text-red-800' },
      yellow: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
    }
    return colorMap[color] || colorMap.blue
  }



  return (
    <GuestGate
      feature="Knowledge Base"
      description="Sign in to access and manage your workspace documents and knowledge base."
      requireAuth
    >
    <Page>
      <PageHeader title="Knowledge Base" description="Manage your documents and folders" />

        {/* Search Bar and Upload Button */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <form onSubmit={handleSearchSubmit} className="relative w-full max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input 
                placeholder="Search files and folders" 
                value={searchQuery}
                onChange={(e) => {
                  const val = e.target.value
                  setSearchQuery(val)
                  if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
                  searchTimeoutRef.current = setTimeout(() => {
                    applyLocalFilter(val)
                  }, 300)
                }}
                className="pl-10 pr-12 w-full bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    applyLocalFilter('')
                  }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </form>
          </div>
        </div>

        

        <main className="space-y-8 sm:space-y-12">
          {/* Folders Section */}
          <div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Folders</h2>
                <Button 
                  size="sm" 
                  className="flex items-center gap-1.5 w-full sm:w-auto bg-secondary text-secondary-foreground hover:bg-secondary/90 text-xs sm:text-sm"
                  onClick={startInlineNewFolder}
                >
                <Plus className="w-4 h-4" />
                <span>New Folder</span>
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {isInlineNewFolder && (
                <div className="group relative cursor-default transition-all rounded-lg bg-gray-50 border border-dashed border-gray-300 p-4">
                  {/* Folder icon */}
                  <div className="flex flex-col items-center">
                    <div className="relative mb-2 w-20 h-16 sm:w-28 sm:h-24">
                      <svg viewBox="0 0 96 80" className="w-full h-full">
                        <rect x="12" y="20" width="64" height="48" fill="#e5e7eb" rx="2" />
                        <path d="M8 16h20l8-8h52c4.4 0 8 3.6 8 8v48c0 4.4-3.6 8-8 8H8c-4.4 0-8-3.6-8-8V24c0-4.4 3.6-8 8-8z" fill="#d1d5db" stroke="#c7cdd3" strokeWidth="1" />
                      </svg>
                    </div>
                    {/* Inline name input */}
                    <div className="w-full max-w-[180px] mx-auto">
                      <input
                        ref={inlineInputRef}
                        value={inlineFolderName}
                        onChange={(e) => {
                          setInlineFolderName(e.target.value)
                          if (inlineFolderError) setInlineFolderError('')
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') confirmInlineNewFolder()
                          if (e.key === 'Escape') cancelInlineNewFolder()
                        }}
                        placeholder="New folder"
                        className={`w-full text-center text-sm px-2 py-1 rounded border ${inlineFolderError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-primary focus:ring-1 focus:ring-primary'} outline-none`}
                      />
                      {inlineFolderError && (
                        <p className="mt-1 text-xs text-red-600">{inlineFolderError}</p>
                      )}
                      <div className="mt-2 flex items-center justify-center gap-2">
                        <Button size="sm" variant="outline" className="h-7 px-3" onClick={cancelInlineNewFolder} disabled={isInlineCreating}>Cancel</Button>
                        <Button size="sm" className="h-7 px-3 bg-primary text-primary-foreground hover:bg-primary/90" onClick={confirmInlineNewFolder} disabled={isInlineCreating}>
                          {isInlineCreating ? 'Creating…' : 'Create'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {foldersLoading ? (
                <div className="col-span-full flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  <span className="ml-2 text-gray-600">Loading folders...</span>
                </div>
              ) : folders.length > 0 ? (
                folders.map((folder) => {


                  return (
                    <div
                      key={folder.id}
                      className={`group relative cursor-pointer transition-all duration-300 ${
                        dragOverFolder === folder.id ? 'scale-105' : ''
                      } ${selectedFolder === folder.id ? 'ring-2 ring-blue-500 bg-blue-50 rounded-lg' : 'hover:bg-gray-100 rounded-lg'}`}
                      onClick={() => setSelectedFolder(selectedFolder === folder.id ? null : folder.id)}
                      onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                      onDragLeave={handleFolderDragLeave}
                      onDrop={(e) => handleFolderDrop(e, folder.id)}
                    >
                      {/* Custom Folder Icon */}
                      <div className="relative flex flex-col items-center p-3 sm:p-4">
                        {/* Custom SVG Folder Icon */}
                        <div className="relative mb-2 w-20 h-16 sm:w-28 sm:h-24 group-hover:scale-110 transition-transform duration-300">
                          <svg
                            viewBox="0 0 96 80"
                            className="w-full h-full drop-shadow-sm group-hover:drop-shadow-lg transition-all duration-300"
                          >
                            {/* Drop Shadow */}
                            <ellipse
                              cx="48"
                              cy="76"
                              rx="40"
                              ry="4"
                              fill="rgba(0,0,0,0.1)"
                              className="group-hover:opacity-80 transition-opacity duration-300"
                            />
                            
                            {/* Back Side - Flat surface */}
                            <rect
                              x="12"
                              y="20"
                              width="64"
                              height="48"
                              fill="#4b5563"
                              rx="2"
                            />
                            
                            {/* Internal Shadow on Right */}
                            <rect
                              x="68"
                              y="20"
                              width="4"
                              height="48"
                              fill="rgba(0,0,0,0.2)"
                              rx="0"
                            />
                            
                            {/* Front Side - Main folder body with curve */}
                            <path
                              d="M8 16h20l8-8h52c4.4 0 8 3.6 8 8v48c0 4.4-3.6 8-8 8H8c-4.4 0-8-3.6-8-8V24c0-4.4 3.6-8 8-8z"
                              fill="#374151"
                              stroke="#1f2937"
                              strokeWidth="1"
                              className="group-hover:fill-gray-600 transition-colors duration-300"
                            />
                          </svg>
                        </div>
                        
                        {/* Folder Info */}
                        <div className="text-center">
                          <h3 className="font-medium text-gray-900 text-xs sm:text-sm mb-1 group-hover:text-gray-700 transition-colors duration-300 truncate max-w-full">
                            {folder.name}
                          </h3>
                          <p className="text-xs text-gray-500 group-hover:text-gray-600 transition-colors duration-300">
                            {folder.document_count} {folder.document_count === 1 ? 'File' : 'Files'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="col-span-full text-center py-12">
                  <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No folders yet</h3>
                  <p className="text-gray-500 mb-4">Create your first folder to organize your documents</p>
                  <Button onClick={() => setShowNewFolderDialog(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Folder
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Files Section - only show if we have documents */}
          {documents.length > 0 && (
            <div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Files</h2>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  {selectedDocuments.length > 0 && (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setShowMoveDialog(true)}
                        className="flex items-center space-x-2 text-xs sm:text-sm"
                      >
                        <FolderInput className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span>Move ({selectedDocuments.length})</span>
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setSelectedDocuments([])}
                        className="text-xs sm:text-sm"
                      >
                        Clear Selection
                      </Button>
                    </>
                  )}
                  {selectedFolder && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setSelectedFolder(null)}
                      className="text-xs sm:text-sm"
                    >
                      <Eye className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      View All Files
                    </Button>
                  )}
                  <Button size="sm" className="text-xs sm:text-sm bg-secondary text-secondary-foreground hover:bg-secondary/90 gap-1.5">
                    <Download className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span>Export</span>
                  </Button>
                  <Button 
                    size="sm"
                    className="flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/90 text-xs sm:text-sm gap-1.5"
                    onClick={handleFileSelect}
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload</span>
                  </Button>
                </div>
              </div>

              {/* Files Table */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-3 sm:px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="text-left px-3 sm:px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                          Date Added
                        </th>
                        <th className="text-left px-3 sm:px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                          Size
                        </th>
                        <th className="text-left px-3 sm:px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                          Status
                        </th>
                        <th className="px-3 sm:px-6 py-3"></th>
                      </tr>
                    </thead>
                                      <tbody className="divide-y divide-gray-200">
                      {documents.map((doc) => {
                        // Determine file icon based on content type
                        const getFileIcon = () => {
                          const type = doc.content_type?.toLowerCase()
                          if (type === 'pdf') return <FileText className="w-5 h-5 text-red-500" />
                          if (type === 'docx' || type === 'doc') return <FileText className="w-5 h-5 text-blue-500" />
                          if (type === 'markdown' || type === 'md') return <FileText className="w-5 h-5 text-gray-600" />
                          return <FileText className="w-5 h-5 text-gray-400" />
                        }

                        // Format file name with extension
                        const getFileName = () => {
                          const hasExtension = doc.title.includes('.')
                          if (hasExtension) return doc.title
                          // Add extension based on content type if not present
                          const extensionMap: { [key: string]: string } = {
                            'pdf': '.pdf',
                            'docx': '.docx',
                            'markdown': '.md',
                            'text': '.txt',
                            'html': '.html'
                          }
                          const ext = extensionMap[doc.content_type?.toLowerCase()] || ''
                          return doc.title + ext
                        }

                        return (
                          <tr 
                            key={doc.id}
                            draggable
                            className={`hover:bg-gray-50 transition-colors ${
                              selectedDocuments.includes(doc.id) ? 'bg-blue-50' : ''
                            } ${draggedDocument === doc.id ? 'opacity-50' : ''}`}
                            onDragStart={(e) => handleDocumentDragStart(e, doc.id)}
                            onDragEnd={() => setDraggedDocument(null)}
                          >
                            <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleDocumentSelection(doc.id)
                                  }}
                                  className="mr-2 sm:mr-3 w-4 h-4 rounded border border-gray-300 hover:border-blue-500 flex items-center justify-center transition-colors"
                                >
                                  {selectedDocuments.includes(doc.id) && (
                                    <Check className="w-3 h-3 text-blue-600" />
                                  )}
                                </button>
                                {getFileIcon()}
                                <div className="ml-2 sm:ml-3 min-w-0 flex-1">
                                  <span className="text-sm font-medium text-gray-900 truncate block">
                                    {getFileName()}
                                  </span>
                                  {/* Show date on mobile when other columns are hidden */}
                                  <span className="text-xs text-gray-500 sm:hidden">
                                    {new Date(doc.created_at).toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric', 
                                      year: 'numeric' 
                                    })}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden sm:table-cell">
                              {new Date(doc.created_at).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })}
                            </td>
                            <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden md:table-cell">
                              {doc.word_count ? `${doc.word_count} words` : '-'}
                            </td>
                            <td className="px-3 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                doc.is_indexed 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-orange-100 text-orange-800'
                              }`}>
                                {doc.is_indexed ? 'Indexed' : 'Pending'}
                              </span>
                            </td>
                            <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex items-center justify-end space-x-1 sm:space-x-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedDocuments([doc.id])
                                    setShowMoveDialog(true)
                                  }}
                                  className="text-gray-400 hover:text-blue-600 transition-colors p-1"
                                  title="Move to folder"
                                >
                                  <Move className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    deleteDocument(doc.id)
                                  }}
                                  className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {/* Upload zone visible below files list (main page as per reference) */}
              {!selectedFolder && (
                <Card 
                  className={`mt-8 border-2 border-dashed rounded-xl p-8 lg:p-12 text-center transition-colors ${
                    dragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <div className="space-y-4">
                    <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto ${
                      dragActive ? 'bg-primary/10' : 'bg-gray-100'
                    }`}>
                      <Upload className={`w-7 h-7 sm:w-8 sm:h-8 ${dragActive ? 'text-primary' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">
                        Drag & drop files or click to browse
                      </h3>
                      <p className="text-xs sm:text-sm text-gray-500 mb-4">
                        Support for PDF, DOCX, TXT, MD files up to 10MB each
                      </p>
                      <input
                        id="kb-upload-bottom"
                        type="file"
                        multiple
                        accept=".pdf,.docx,.txt,.md,.html,.json"
                        onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                        className="hidden"
                      />
                      <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 text-sm sm:text-base">
                        <label htmlFor="kb-upload-bottom">Browse Files</label>
                      </Button>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Upload Zone - only show when there are no documents */}
          {documents.length === 0 && (
            <div>
              <Card 
                className={`bg-white border-2 border-dashed rounded-xl p-6 sm:p-8 lg:p-12 text-center transition-colors ${
                  dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={handleFileSelect}
              >
                <div className="space-y-4">
                  <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto ${
                    dragActive ? 'bg-blue-100' : 'bg-gray-100'
                  }`}>
                    <Upload className={`w-6 h-6 sm:w-8 sm:h-8 ${dragActive ? 'text-blue-600' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">
                      {dragActive ? 'Drop files here to upload' : 'Drag & drop files or click to browse'}
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-500 mb-4">
                      Support for PDF, DOCX, TXT, MD files up to 10MB each
                    </p>
                    <Button type="button" onClick={handleFileSelect} className="bg-primary text-primary-foreground hover:bg-primary/90 text-sm sm:text-base">
                      Browse Files
                    </Button>
                  </div>
                </div>
              </Card>
              
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.html,.json"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                className="hidden"
              />
            </div>
          )}

          {/* Upload Status */}
          {uploadStatus.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Upload Progress</h3>
              {uploadStatus.map((upload, index) => (
                <Card key={index} className="p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                      <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">{upload.file.name}</p>
                        <p className="text-xs text-gray-500">
                          {Math.round(upload.file.size / 1024)} KB
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {upload.status === 'uploading' && (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      )}
                      {upload.status === 'success' && (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      )}
                      {upload.status === 'error' && (
                        <X className="w-4 h-4 text-red-600" />
                      )}
                      <span className="text-xs text-gray-500">
                        {upload.status === 'uploading' && `${upload.progress}%`}
                        {upload.status === 'success' && 'Complete'}
                        {upload.status === 'error' && 'Failed'}
                      </span>
                    </div>
                  </div>
                  {upload.message && (
                    <p className="text-xs text-gray-500 mt-2">{upload.message}</p>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-8 sm:py-12">
              <div className="flex items-center space-x-2">
                <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin text-blue-600" />
                <span className="text-sm sm:text-base text-gray-600">Loading documents from Glass RAG...</span>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <Card className="p-4 sm:p-6 border-red-200 bg-red-50">
              <div className="flex items-center space-x-2 text-red-800">
                <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-sm sm:text-base font-medium">Error loading documents:</span>
              </div>
              <p className="text-sm sm:text-base text-red-700 mt-2">{error}</p>
            </Card>
          )}

          {/* Hidden file input - always present for upload button functionality */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,.html,.json"
            onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
            className="hidden"
          />
        </main>

        {/* Move Documents Dialog */}
        {showMoveDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <Card className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-sm sm:max-w-md max-h-[80vh] overflow-y-auto">
              <div className="space-y-4">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                    Move {selectedDocuments.length} document{selectedDocuments.length !== 1 ? 's' : ''}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-500">Select a folder to move the selected document(s) to</p>
                </div>
                
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {/* Move to root (no folder) option */}
                  <button
                    onClick={() => bulkMoveDocuments(null)}
                    className="w-full p-3 text-left rounded-lg border hover:bg-gray-50 transition-colors flex items-center space-x-3"
                  >
                    <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center">
                      <Database className="w-4 h-4 text-gray-600" />
                    </div>
                    <span className="text-sm font-medium">Root (No Folder)</span>
                  </button>

                  {/* Available folders */}
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => bulkMoveDocuments(folder.id)}
                      className="w-full p-3 text-left rounded-lg border hover:bg-gray-50 transition-colors flex items-center space-x-3"
                    >
                      <div className={`w-8 h-8 rounded ${getFolderColor(folder.color).bg} flex items-center justify-center`}>
                        <span className="text-sm">{folder.icon_emoji || '📁'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{folder.name}</p>
                        <p className="text-xs text-gray-500">{folder.document_count} files</p>
                      </div>
                    </button>
                  ))}

                  {folders.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <FolderOpen className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm">No folders available</p>
                      <p className="text-xs">Create a folder first to organize your documents</p>
                    </div>
                  )}
                </div>
                
                <div className="flex justify-end space-x-2 pt-4 border-t">
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setShowMoveDialog(false)
                      setSelectedDocuments([])
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* New Folder Dialog */}
        {showNewFolderDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <Card className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-sm sm:max-w-md">
              <div className="space-y-4">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">Create New Folder</h3>
                  <p className="text-xs sm:text-sm text-gray-500">Enter a name for your new folder</p>
                </div>
                
                <div>
                  <Input
                    placeholder="Folder name"
                    value={newFolderName}
                    onChange={(e) => {
                      setNewFolderName(e.target.value)
                      // Clear error when user starts typing
                      if (folderNameError) setFolderNameError('')
                    }}
                    className={`w-full ${folderNameError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newFolderName.trim() && !isCreatingFolder) {
                        createFolder();
                      }
                      if (e.key === 'Escape') {
                        setShowNewFolderDialog(false);
                        setNewFolderName('');
                        setFolderNameError('');
                      }
                    }}
                    autoFocus
                    disabled={isCreatingFolder}
                  />
                  {folderNameError && (
                    <p className="mt-2 text-sm text-red-600 flex items-center">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      {folderNameError}
                    </p>
                  )}
                </div>
                
                <div className="flex justify-end space-x-2">
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setShowNewFolderDialog(false);
                      setNewFolderName('');
                      setFolderNameError('');
                    }}
                    disabled={isCreatingFolder}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={createFolder}
                    disabled={!newFolderName.trim() || isCreatingFolder}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isCreatingFolder ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create'
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
    </Page>
    </GuestGate>
  )
} 