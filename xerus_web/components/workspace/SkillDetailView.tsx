'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import useSWR from 'swr'
import { MarkdownPreview } from '@/components/workspace/MarkdownPreview'
import { ArrowLeft, FileText, Trash2, Pencil, Loader2, Hash, Bot, X, Minus, Eye, Sparkles, ArrowUp, Shield } from 'lucide-react'
import { getSkill, installSkill, uninstallSkill, deleteSkill } from '@/lib/api/skills'
import { getAssistants } from '@/lib/api/agents'
import type { SkillDetail, Assistant } from '@/lib/api/types'
import { useAuth } from '@/utils/AuthContext'
import { XerusLoader } from '@/components/common/XerusLoader'
import { InstallButton } from '@/components/skills/InstallButton'
import { FloatingPanel } from '@/components/common/FloatingPanel'
import { FloatingPanelProvider } from '@/components/common/FloatingPanelContext'
import { SkillSecretsCard } from '@/components/skills/SkillSecretsCard'
import { parseSkillEnvKeys } from '@/lib/utils/parse-skill-env-keys'
import { toast } from '@/lib/toast'

function SkillFileViewer({ slug, filePath, onContentLoaded }: { slug: string; filePath: string; onContentLoaded?: (content: string) => void }) {
  const { data: content, isLoading: loading } = useSWR(
    `skill-file-${slug}-${filePath}`,
    async () => {
      const { readSkillFile } = await import('@/lib/api/skills')
      const data = await readSkillFile(slug, filePath)
      onContentLoaded?.(data)
      return data
    }
  )
  if (loading) return <div className="py-8 text-center text-text-secondary text-sm">Loading...</div>
  const isMarkdown = filePath.endsWith('.md')
  return isMarkdown && content ? (
    <MarkdownPreview content={content} className="px-0 py-0 bg-transparent" />
  ) : (
    <pre className="text-sm text-text font-mono whitespace-pre-wrap leading-relaxed bg-surface-hover rounded-xl p-4 border border-surface-active overflow-x-auto">{content || 'Empty file.'}</pre>
  )
}

function SkillAgentsCard({ isInstalled, agents, installedByAgents }: { isInstalled: boolean; agents: Assistant[]; installedByAgents: number[] }) {
  const installedSet = new Set(installedByAgents)
  const assignedAgents = agents.filter((a) => installedSet.has(a.id))
  return (
    <div className="bg-surface rounded-[24px] border border-surface-active shadow-sm p-6">
      {assignedAgents.length > 0 ? (
        <div className="space-y-2">
          {assignedAgents.map((agent) => (
            <div key={agent.id} className="flex items-center gap-2.5 py-1.5">
              <div className="w-7 h-7 rounded-lg bg-surface-hover flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-text-secondary" />
              </div>
              <span className="text-sm font-medium text-text truncate">{agent.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-secondary py-2">
          {isInstalled ? 'This skill is installed to your workspace. All your agents can use it.' : 'Install this skill to make it available to your agents.'}
        </p>
      )}
    </div>
  )
}

function SkillChannelsCard({ skillSlug }: { skillSlug: string }) {
  return (
    <div className="bg-surface rounded-[24px] border border-surface-active shadow-sm p-6">
      <p className="text-xs text-text-secondary py-2">
        Channel-scoped installs are not wired yet for <span className="font-medium text-text">{skillSlug}</span>. Install this skill once and it becomes available from the shared workspace.
      </p>
    </div>
  )
}

interface SkillDetailViewProps {
  skillSlug: string
  onBack: () => void
}

export function SkillDetailView({ skillSlug, onBack }: SkillDetailViewProps) {
  const { user: authUser } = useAuth()

  const { data: skill, error, isLoading, mutate: mutateSkill } = useSWR<SkillDetail | null>(
    skillSlug ? `skill-${skillSlug}` : null,
    () => getSkill(skillSlug)
  )

  const { data: agents = [] } = useSWR<Assistant[]>(
    'agents-list',
    async () => { const result = await getAssistants(); return result.agents }
  )

  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [editorMode, setEditorMode] = useState<'view' | 'edit'>('view')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [skillMdContent, setSkillMdContent] = useState<string | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadSkillMd = useCallback(async () => {
    if (skillMdContent !== null || !skill) return
    setLoadingContent(true)
    try {
      const { readSkillFile } = await import('@/lib/api/skills')
      const content = await readSkillFile(skillSlug, 'SKILL.md')
      setSkillMdContent(content)
    } catch {
      setSkillMdContent('Failed to load SKILL.md content.')
    } finally {
      setLoadingContent(false)
    }
  }, [skillSlug, skill, skillMdContent])

  if (skill && skillMdContent === null && !loadingContent) loadSkillMd()

  const handleInstall = useCallback(async (_agentId: number, scope: 'channel' | 'global', channelId?: string) => {
    if (!skill) return
    await installSkill(skill.slug, { scope, channel_id: channelId })
    mutateSkill()
  }, [skill, mutateSkill])

  const handleUninstall = useCallback(async (_agentId: number) => {
    if (!skill) return
    await uninstallSkill(skill.slug)
    mutateSkill()
  }, [skill, mutateSkill])

  const handleDelete = useCallback(async () => {
    if (!skill) return
    toast('This skill will be permanently removed.', {
      action: {
        label: 'Yes, delete',
        onClick: async () => {
          setDeleting(true)
          try {
            await deleteSkill(skill.slug)
            toast.success('Skill deleted', { description: 'This skill has been permanently removed.' })
            onBack()
          } catch {
            toast.error("Couldn't remove this skill", { description: 'Please try again in a moment.' })
          } finally {
            setDeleting(false)
          }
        },
      },
    })
  }, [skill, onBack])

  if (isLoading) return <XerusLoader />

  if (error || !skill) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        <Image src="/logo/xerus.svg" alt="" width={40} height={40} className="opacity-30" />
        <div className="text-center">
          <h1 className="text-lg font-serif text-text mb-1">Skill not found</h1>
          <p className="text-sm text-text-secondary">The skill you are looking for does not exist or was removed.</p>
        </div>
        <button onClick={onBack} className="px-5 py-2.5 bg-[#FF6600] hover:bg-[#E65C00] text-white font-medium rounded-xl text-sm transition-colors">
          Back to Skills
        </button>
      </div>
    )
  }

  const isOwner = skill.userId === authUser?.uid
  const isInstalled = skill.isInstalled
  const readmeFile = skill.files.find((f) => f.path.toLowerCase() === 'readme.md')
  const otherFiles = skill.files.filter((f) => f.path !== 'SKILL.md' && f.path.toLowerCase() !== 'readme.md')
  const requiredEnvKeys = skillMdContent ? parseSkillEnvKeys(skillMdContent) : []

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-surface-alt font-sans text-text">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Nav */}
        <div className="flex items-center justify-between mb-8">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-text-secondary hover:text-text transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Skills
          </button>
          {isOwner && (
            <button onClick={handleDelete} disabled={deleting} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-text-secondary hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
            </button>
          )}
        </div>

        {/* Header */}
        <div className="flex items-start gap-6 mb-10">
          <div className="flex-1 min-w-0">
            <h1 className="font-serif text-3xl text-text mb-2">{skill.name}</h1>
            <p className="text-lg text-text-secondary font-light max-w-2xl">{skill.description}</p>
          </div>
          <div className="shrink-0">
            {isInstalled ? (
              <button onClick={async () => { await handleUninstall(0); mutateSkill() }} className="flex items-center gap-2 bg-black hover:bg-[#1a1a1a] text-white font-medium px-5 py-2.5 rounded-xl text-sm shadow-sm transition-all">
                Uninstall
              </button>
            ) : (
              <InstallButton skill={skill} agents={agents} onInstall={handleInstall} onUninstall={handleUninstall} />
            )}
          </div>
        </div>

        {/* Two-column */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {isInstalled && requiredEnvKeys.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-serif text-xl flex items-center gap-2 px-1"><Shield className="w-5 h-5 text-[#FF6600]" /> Authentication</h3>
                <SkillSecretsCard skillSlug={skill.slug} envKeys={requiredEnvKeys} />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1"><FileText className="w-5 h-5 text-[#FF6600]" /><h3 className="text-2xl font-serif text-text">Skill Files</h3></div>
              <div className="bg-surface rounded-[24px] border border-surface-active shadow-sm p-4 space-y-3">
                <div className="bg-surface-hover rounded-xl px-5 py-4 flex items-center gap-4 cursor-pointer" onClick={() => setActiveFile('SKILL.md')}>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-text mb-1 block">SKILL.md</span>
                    <p className="text-sm leading-relaxed text-text font-medium line-clamp-2">{skillMdContent ? skillMdContent.split('\n').filter(Boolean).slice(0, 2).join(' ') : 'Loading...'}</p>
                  </div>
                  <button className="h-9 px-4 bg-text hover:bg-[#FF6600] rounded-xl text-white flex items-center gap-2 shrink-0 text-sm font-medium transition-colors">
                    {isInstalled || isOwner ? <><Pencil className="w-3.5 h-3.5" /> Edit</> : <><FileText className="w-3.5 h-3.5" /> View</>}
                  </button>
                </div>
                {otherFiles.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {otherFiles.map((file) => (
                      <div key={file.path} className="bg-surface-hover rounded-xl px-5 py-4 flex items-center gap-4 cursor-pointer" onClick={() => setActiveFile(file.path)}>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-text">{file.path}</span>
                          <p className="text-xs text-text-secondary mt-0.5">{file.size > 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${file.size} B`}</p>
                        </div>
                        <button className="h-9 px-4 bg-text hover:bg-[#FF6600] rounded-xl text-white flex items-center gap-2 shrink-0 text-sm font-medium transition-colors">
                          {isInstalled || isOwner ? <><Pencil className="w-3.5 h-3.5" /> Edit</> : <><FileText className="w-3.5 h-3.5" /> View</>}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {readmeFile && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1"><FileText className="w-5 h-5 text-[#FF6600]" /><h3 className="text-2xl font-serif text-text">README</h3></div>
                <div className="bg-surface rounded-[24px] border border-surface-active shadow-sm p-6">
                  <SkillFileViewer slug={skillSlug} filePath={readmeFile.path} />
                </div>
              </div>
            )}
          </div>

          <FloatingPanelProvider>
            <FloatingPanel isOpen={!!activeFile} onClose={() => setActiveFile(null)} title={activeFile || ''} minimizedTitle={activeFile || ''} icon={<FileText className="w-4 h-4" />} className="w-[600px] h-[600px] rounded-[40px] shadow-sm bg-surface p-2" variant="clean">
              {({ close, minimize }) => (
                <div className="bg-white rounded-[32px] h-full w-full flex flex-col p-6 overflow-hidden">
                  <div className="flex items-center justify-between mb-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <button onClick={close} className="p-1.5 bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-full transition-colors"><X className="w-4 h-4 text-text" /></button>
                      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); minimize() }} className="p-1.5 bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-full transition-colors"><Minus className="w-4 h-4 text-text" /></button>
                    </div>
                    <span className="text-sm font-bold text-text">{activeFile}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {editorMode === 'edit' ? (
                      <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="flex-1 w-full h-full resize-none outline-none text-sm text-text bg-transparent leading-relaxed font-mono" autoFocus />
                    ) : (
                      activeFile && <SkillFileViewer slug={skillSlug} filePath={activeFile} onContentLoaded={setEditContent} />
                    )}
                  </div>
                  <div className="mt-4 p-1.5 rounded-[20px] border border-surface-active bg-white flex items-center justify-between shadow-sm shrink-0">
                    <button disabled className="h-9 px-3 rounded-[12px] flex items-center gap-2 text-text-secondary font-medium text-sm opacity-50 cursor-not-allowed"><Sparkles className="w-4 h-4" /> Write with AI</button>
                    <div className="flex items-center bg-surface rounded-[14px] p-1">
                      <button onClick={() => setEditorMode('view')} className={`flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all ${editorMode === 'view' ? 'bg-white shadow-sm text-text' : 'text-text-secondary hover:text-text'}`}><Eye className="w-3.5 h-3.5" /> View</button>
                      {(isInstalled || isOwner) && <button onClick={() => setEditorMode('edit')} className={`flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all ${editorMode === 'edit' ? 'bg-white shadow-sm text-text' : 'text-text-secondary hover:text-text'}`}><Pencil className="w-3.5 h-3.5" /> Edit</button>}
                    </div>
                    <div className="flex items-center gap-2">
                      {(isInstalled || isOwner) ? (
                        <button onClick={async () => { if (!activeFile) return; setSaving(true); try { const { writeSkillFile } = await import('@/lib/api/skills'); await writeSkillFile(skillSlug, activeFile, editContent); mutateSkill() } finally { setSaving(false) } }} disabled={saving || editorMode === 'view'} className={`w-9 h-9 rounded-[12px] flex items-center justify-center shadow-md transition-colors ${editorMode === 'edit' ? 'bg-text text-white hover:bg-[#FF6600]' : 'bg-surface text-text-secondary cursor-not-allowed'}`}>
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
                        </button>
                      ) : (
                        <button onClick={close} className="h-9 px-4 bg-surface hover:bg-surface-active rounded-[12px] text-text text-sm font-medium transition-colors">Close</button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </FloatingPanel>
          </FloatingPanelProvider>

          <div className="space-y-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1"><Bot className="w-5 h-5 text-[#FF6600]" /><h3 className="text-2xl font-serif text-text">Agents</h3></div>
              <SkillAgentsCard isInstalled={isInstalled} agents={agents} installedByAgents={skill.installedByAgents || []} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1"><Hash className="w-5 h-5 text-[#FF6600]" /><h3 className="text-2xl font-serif text-text">Channels</h3></div>
              <SkillChannelsCard skillSlug={skill.slug} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
