'use client';

import { useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import useSWR from 'swr';
import { MarkdownPreview } from '@/components/workspace/MarkdownPreview';
import {
    ArrowLeft, FileText, Trash2, Plus, MessageSquare,
    Pencil, Loader2, Hash, Bot, X, Minus, Eye, Sparkles, ArrowUp, Shield,
} from 'lucide-react';
import { getSkill, installSkill, uninstallSkill, deleteSkill } from '@/lib/api/skills';
import { getAssistants } from '@/lib/api/agents';
import type { SkillDetail, Assistant } from '@/lib/api/types';
import { useRedirectIfNotAuth, useAuth } from '@/utils/AuthContext';
import { XerusLoader } from '@/components/common/XerusLoader';
import { InstallButton } from '@/components/skills/InstallButton';
import { FloatingPanel } from '@/components/common/FloatingPanel';
import { FloatingPanelProvider } from '@/components/common/FloatingPanelContext';
import { SkillSecretsCard } from '@/components/skills/SkillSecretsCard';
import { getSkillConfigRequirements } from '@/lib/utils/parse-skill-env-keys';
import { toast } from '@/lib/toast';
import { apiCall } from '@/lib/api/client';

export default function SkillDetailPage() {
    const router = useRouter();
    const params = useParams();
    const slug = params.slug as string;
    const user = useRedirectIfNotAuth();
    const { user: authUser } = useAuth();

    const { data: skill, error, isLoading, mutate: mutateSkill } = useSWR<SkillDetail | null>(
        user && slug ? `skill-${slug}` : null,
        () => getSkill(slug),
    );

    const { data: agents = [], isLoading: agentsLoading } = useSWR<Assistant[]>(
        user ? 'agents-list' : null,
        async () => {
            const result = await getAssistants();
            return result.agents;
        },
    );

    const [activeFile, setActiveFile] = useState<string | null>(null);
    const [editorMode, setEditorMode] = useState<'view' | 'edit'>('view');
    const [editContent, setEditContent] = useState('');
    const [saving, setSaving] = useState(false);
    const [skillMdContent, setSkillMdContent] = useState<string | null>(null);
    const [loadingContent, setLoadingContent] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const loadSkillMd = useCallback(async () => {
        if (skillMdContent !== null || !skill) return;
        setLoadingContent(true);
        try {
            const { readSkillFile } = await import('@/lib/api/skills');
            const content = await readSkillFile(slug, 'SKILL.md');
            setSkillMdContent(content);
        } catch {
            setSkillMdContent('Failed to load SKILL.md content.');
        } finally {
            setLoadingContent(false);
        }
    }, [slug, skill, skillMdContent]);

    if (skill && skillMdContent === null && !loadingContent) {
        loadSkillMd();
    }

    const handleInstall = useCallback(async (_agentId: number, scope: 'channel' | 'global', channelId?: string) => {
        if (!skill) return;
        await installSkill(skill.slug, { scope, channel_id: channelId });
        mutateSkill();
    }, [skill, mutateSkill]);

    const handleUninstall = useCallback(async (_agentId: number) => {
        if (!skill) return;
        await uninstallSkill(skill.slug);
        mutateSkill();
    }, [skill, mutateSkill]);

    const handleDelete = useCallback(async () => {
        if (!skill) return;
        toast('This skill will be permanently removed.', {
            action: {
                label: 'Yes, delete',
                onClick: async () => {
                    setDeleting(true);
                    try {
                        await deleteSkill(skill.slug);
                        toast.success('Skill deleted', { description: 'This skill has been permanently removed.' });
                        router.push('/skills');
                    } catch (error) {
                        toast.error("Couldn't remove this skill", { description: 'Please try again in a moment.' });
                    } finally {
                        setDeleting(false);
                    }
                },
            },
        });
    }, [skill, router]);

    if (isLoading) return <XerusLoader />;

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
                <Image src="/logo/xerus.svg" alt="" width={40} height={40} className="opacity-30" />
                <div className="text-center">
                    <h1 className="text-lg font-serif text-text mb-1">Could not load skill</h1>
                    <p className="text-sm text-text-secondary">Something went wrong. Please try again.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => mutateSkill()} className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl text-sm transition-colors">
                        Retry
                    </button>
                    <button onClick={() => router.push('/workspace')} className="px-5 py-2.5 bg-surface-hover hover:bg-surface-active text-text font-medium rounded-xl text-sm transition-colors">
                        Back to Skills
                    </button>
                </div>
            </div>
        );
    }

    if (!skill) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
                <Image src="/logo/xerus.svg" alt="" width={40} height={40} className="opacity-30" />
                <div className="text-center">
                    <h1 className="text-lg font-serif text-text mb-1">Skill not found</h1>
                    <p className="text-sm text-text-secondary">The skill you are looking for does not exist or was removed.</p>
                </div>
                <button onClick={() => router.push('/workspace')} className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl text-sm transition-colors">
                    Back to Skills
                </button>
            </div>
        );
    }

    const isOwner = skill.userId === authUser?.uid;
    const isInstalled = skill.isInstalled;
    const readmeFile = skill.files.find(f => f.path.toLowerCase() === 'readme.md');
    const otherFiles = skill.files.filter(f => f.path !== 'SKILL.md' && f.path.toLowerCase() !== 'readme.md');
    const skillConfig = getSkillConfigRequirements(skill.slug, skillMdContent ?? undefined);

    return (
        <div className="min-h-screen font-sans text-text">
            <div className="max-w-5xl mx-auto px-6 py-12">
                {/* Nav bar */}
                <div className="flex items-center justify-between mb-8">
                    <button onClick={() => router.push('/skills')} className="flex items-center gap-2 text-sm text-text-secondary hover:text-text transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                        Back to Skills
                    </button>
                    {isOwner && (
                        <div className="flex items-center gap-1">
                            <button onClick={handleDelete} disabled={deleting} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
                            </button>
                        </div>
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
                            <button
                                onClick={async () => {
                                    await handleUninstall(0);
                                    mutateSkill();
                                }}
                                className="flex items-center gap-2 bg-black hover:bg-[#1a1a1a] text-white font-medium px-5 py-2.5 rounded-xl text-sm shadow-sm transition-all"
                            >
                                Uninstall
                            </button>
                        ) : (
                            <InstallButton
                                skill={skill}
                                agents={agents}
                                onInstall={handleInstall}
                                onUninstall={handleUninstall}
                            />
                        )}
                    </div>
                </div>

                {/* Two-column layout */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left column */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Configure — secrets + CLI tools for skills that need auth */}
                        {isInstalled && skillConfig.hasAuth && (
                            <div className="space-y-2">
                                <h3 className="font-serif text-xl flex items-center gap-2 px-1">
                                    <Shield className="w-5 h-5 text-secondary" />
                                    Configuration
                                </h3>
                                <div className="space-y-3">
                                    {skillConfig.envKeys.length > 0 && (
                                        <SkillSecretsCard skillSlug={skill.slug} envKeys={skillConfig.envKeys} />
                                    )}
                                    {skillConfig.bins.length > 0 && (
                                        <div className="bg-surface rounded-3xl border border-surface-active shadow-sm p-6 space-y-3">
                                            <p className="text-sm text-text-secondary">
                                                This skill uses the <code className="px-1.5 py-0.5 bg-surface-hover rounded text-sm font-mono">{skillConfig.bins.join(', ')}</code> CLI {skillConfig.bins.length === 1 ? 'tool' : 'tools'} which needs to be authenticated in your workspace.
                                            </p>
                                            <button
                                                onClick={() => router.push(`/chat?q=${encodeURIComponent(`Set up authentication for the "${skill.name}" skill. It needs the ${skillConfig.bins.join(', ')} CLI tool authenticated. Run the auth flow and guide me through it.`)}`)}
                                                className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl text-sm transition-colors"
                                            >
                                                <MessageSquare className="w-4 h-4" />
                                                Ask agent to set up
                                            </button>
                                        </div>
                                    )}
                                    {skillConfig.envKeys.length === 0 && skillConfig.bins.length === 0 && (
                                        <div className="bg-surface rounded-3xl border border-surface-active shadow-sm p-6 space-y-3">
                                            <p className="text-sm text-text-secondary">
                                                This skill requires authentication. Check the SKILL.md file for setup instructions, or ask your agent to configure it.
                                            </p>
                                            <button
                                                onClick={() => router.push(`/chat?q=${encodeURIComponent(`Set up authentication for the "${skill.name}" skill. Check its SKILL.md for what credentials are needed and guide me through the process.`)}`)}
                                                className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl text-sm transition-colors"
                                            >
                                                <MessageSquare className="w-4 h-4" />
                                                Ask agent to set up
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Skill Files */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 px-1">
                                <FileText className="w-5 h-5 text-secondary" />
                                <h3 className="text-2xl font-serif text-text">Skill Files</h3>
                            </div>

                            <div className="bg-surface rounded-3xl border border-surface-active shadow-sm p-4 space-y-3">
                                {/* SKILL.md — full width primary row */}
                                <div
                                    className="bg-surface-hover rounded-xl px-5 py-4 flex items-center gap-4 cursor-pointer"
                                    onClick={() => setActiveFile('SKILL.md')}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-semibold text-text">SKILL.md</span>
                                        </div>
                                        <p className="text-sm leading-relaxed text-text font-medium line-clamp-2">
                                            {skillMdContent ? skillMdContent.split('\n').filter(Boolean).slice(0, 2).join(' ') : 'Loading...'}
                                        </p>
                                    </div>
                                    {(isInstalled || isOwner) ? (
                                        <button className="h-9 px-4 bg-text hover:bg-text/85 rounded-xl text-white flex items-center gap-2 shrink-0 text-sm font-medium transition-colors">
                                            <Pencil className="w-3.5 h-3.5" />
                                            Edit
                                        </button>
                                    ) : (
                                        <button className="h-9 px-4 bg-text/70 rounded-xl text-white flex items-center gap-2 shrink-0 text-sm font-medium">
                                            <FileText className="w-3.5 h-3.5" />
                                            View
                                        </button>
                                    )}
                                </div>

                                {/* Other files — 2 per row */}
                                {otherFiles.length > 0 && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {otherFiles.map(file => (
                                            <div
                                                key={file.path}
                                                className="bg-surface-hover rounded-xl px-5 py-4 flex items-center gap-4 cursor-pointer"
                                                onClick={() => setActiveFile(file.path)}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <span className="text-sm font-semibold text-text">{file.path}</span>
                                                    <p className="text-xs text-text-secondary mt-0.5">
                                                        {file.size > 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${file.size} B`}
                                                    </p>
                                                </div>
                                                {(isInstalled || isOwner) ? (
                                                    <button className="h-9 px-4 bg-text hover:bg-text/85 rounded-xl text-white flex items-center gap-2 shrink-0 text-sm font-medium transition-colors">
                                                        <Pencil className="w-3.5 h-3.5" />
                                                        Edit
                                                    </button>
                                                ) : (
                                                    <button className="h-9 px-4 bg-text/70 rounded-xl text-white flex items-center gap-2 shrink-0 text-sm font-medium">
                                                        <FileText className="w-3.5 h-3.5" />
                                                        View
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* README — always visible below */}
                        {readmeFile && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 px-1">
                                    <FileText className="w-5 h-5 text-secondary" />
                                    <h3 className="text-2xl font-serif text-text">README</h3>
                                </div>

                                <div className="bg-surface rounded-3xl border border-surface-active shadow-sm p-6">
                                    <SkillFileViewer slug={slug} filePath={readmeFile.path} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Floating file editor panel */}
                    <FloatingPanelProvider>
                    <FloatingPanel
                        isOpen={!!activeFile}
                        onClose={() => setActiveFile(null)}
                        title={activeFile || ''}
                        minimizedTitle={activeFile || ''}
                        icon={<FileText className="w-4 h-4" />}
                        className="w-[600px] h-[600px] rounded-[40px] shadow-sm bg-surface p-2"
                        variant="clean"
                    >
                        {({ close, minimize }) => (
                            <div className="bg-white rounded-4xl h-full w-full flex flex-col p-6 overflow-hidden">
                                {/* Header */}
                                <div className="flex items-center justify-between mb-4 shrink-0">
                                    <div className="flex items-center gap-2">
                                        <button onClick={close} className="p-1.5 bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-full transition-colors">
                                            <X className="w-4 h-4 text-text" />
                                        </button>
                                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); minimize(); }} className="p-1.5 bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-full transition-colors">
                                            <Minus className="w-4 h-4 text-text" />
                                        </button>
                                    </div>
                                    <span className="text-sm font-bold text-text">{activeFile}</span>
                                </div>

                                {/* Content */}
                                <div className="flex-1 overflow-y-auto">
                                    {editorMode === 'edit' ? (
                                        <textarea
                                            value={editContent}
                                            onChange={(e) => setEditContent(e.target.value)}
                                            className="flex-1 w-full h-full resize-none outline-none text-sm text-text bg-transparent leading-relaxed font-mono"
                                            autoFocus
                                        />
                                    ) : (
                                        activeFile && <SkillFileViewer slug={slug} filePath={activeFile} onContentLoaded={setEditContent} />
                                    )}
                                </div>

                                {/* Footer Toolbar */}
                                <div className="mt-4 p-1.5 rounded-[20px] border border-surface-active bg-white flex items-center justify-between shadow-sm shrink-0">
                                    <div className="flex items-center gap-2">
                                        <button
                                            disabled
                                            className="h-9 px-3 rounded-[12px] flex items-center gap-2 text-text-secondary font-medium text-sm opacity-50 cursor-not-allowed"
                                        >
                                            <Sparkles className="w-4 h-4" />
                                            Write with AI
                                        </button>
                                    </div>

                                    <div className="flex items-center bg-surface rounded-[14px] p-1">
                                        <button
                                            onClick={() => setEditorMode('view')}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all ${editorMode === 'view' ? 'bg-white shadow-sm text-text' : 'text-text-secondary hover:text-text'}`}
                                        >
                                            <Eye className="w-3.5 h-3.5" />
                                            View
                                        </button>
                                        {(isInstalled || isOwner) && (
                                            <button
                                                onClick={() => setEditorMode('edit')}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all ${editorMode === 'edit' ? 'bg-white shadow-sm text-text' : 'text-text-secondary hover:text-text'}`}
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                                Edit
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {(isInstalled || isOwner) ? (
                                            <button
                                                onClick={async () => {
                                                    if (!activeFile) return;
                                                    setSaving(true);
                                                    try {
                                                        const { writeSkillFile } = await import('@/lib/api/skills');
                                                        await writeSkillFile(slug, activeFile, editContent);
                                                        mutateSkill();
                                                    } finally {
                                                        setSaving(false);
                                                    }
                                                }}
                                                disabled={saving || editorMode === 'view'}
                                                className={`w-9 h-9 rounded-[12px] flex items-center justify-center shadow-md transition-colors ${
                                                    editorMode === 'edit'
                                                        ? 'bg-text text-white hover:bg-primary'
                                                        : 'bg-surface text-text-secondary cursor-not-allowed'
                                                }`}
                                            >
                                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
                                            </button>
                                        ) : (
                                            <button onClick={close} className="h-9 px-4 bg-surface hover:bg-surface-active rounded-[12px] text-text text-sm font-medium transition-colors">
                                                Close
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </FloatingPanel>
                    </FloatingPanelProvider>

                    {/* Right: Sidebar */}
                    <div className="space-y-8">
                        {/* Agents */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 px-1">
                                <div className="flex items-center gap-2">
                                    <Bot className="w-5 h-5 text-secondary" />
                                    <h3 className="text-2xl font-serif text-text">Agents</h3>
                                </div>
                            </div>
                            <SkillAgentsCard
                                isInstalled={isInstalled}
                                agents={agents}
                                installedByAgents={skill.installedByAgents || []}
                                loading={agentsLoading}
                            />
                        </div>

                        {/* Channels */}
                        <SkillChannelsCard
                            skillSlug={skill.slug}
                            onInstall={handleInstall}
                            isInstalled={isInstalled}
                        />

                    </div>
                </div>
            </div>
        </div>
    );
}

// -------------------------------------------------------------------
// Skill File Viewer — loads and renders a single file
// -------------------------------------------------------------------

function SkillFileViewer({ slug, filePath, onContentLoaded }: { slug: string; filePath: string; onContentLoaded?: (content: string) => void }) {
    const { data: content, isLoading: loading } = useSWR(
        `skill-file-${slug}-${filePath}`,
        async () => {
            const { readSkillFile } = await import('@/lib/api/skills');
            const data = await readSkillFile(slug, filePath);
            onContentLoaded?.(data);
            return data;
        },
    );

    if (loading) return <div className="py-8 text-center text-text-secondary text-sm">Loading...</div>;

    const isMarkdown = filePath.endsWith('.md');

    return isMarkdown && content ? (
        <MarkdownPreview content={content} className="px-0 py-0 bg-transparent" />
    ) : (
        <pre className="text-sm text-text font-mono whitespace-pre-wrap leading-relaxed bg-surface-hover rounded-xl p-4 border border-surface-active overflow-x-auto">
            {content || 'Empty file.'}
        </pre>
    );
}

// -------------------------------------------------------------------
// Skill Channels Card — install/uninstall skill to channels (mirrors AgentChannelsCard)
// -------------------------------------------------------------------

function SkillChannelsCard({ skillSlug, onInstall, isInstalled }: {
    skillSlug: string;
    onInstall: (agentId: number, scope: 'channel' | 'global', channelId?: string) => Promise<void>;
    isInstalled: boolean;
}) {
    const [showPicker, setShowPicker] = useState(false);
    const [processing, setProcessing] = useState<string | null>(null);

    const { data: skillDetail, mutate: mutateSkill } = useSWR<SkillDetail | null>(
        skillSlug ? `skill-${skillSlug}` : null,
    );

    const { data: domainsData } = useSWR('company-domains-for-skill', async () => {
        const response = await apiCall('/company/domains', { method: 'GET' });
        const result = await response.json();
        const data = result.data || result;
        return (data.domains || []) as Array<{
            id: string; slug: string; name: string;
            channels: Array<{ id: string; slug: string; name: string; agent_count: number }>;
        }>;
    });

    const installedChannels = skillDetail?.installedChannels ?? [];
    const isGloballyInstalled = skillDetail?.isGloballyInstalled ?? false;
    const installedSet = new Set(installedChannels);

    const allChannels = (domainsData || []).flatMap(d =>
        d.channels.map(ch => ({ ...ch, domainName: d.name, domainSlug: d.slug }))
    );
    const availableChannels = allChannels.filter(ch => !installedSet.has(`${ch.domainSlug}/${ch.slug}`));

    const handleAdd = async (channel: { slug: string; domainSlug: string }) => {
        const channelId = `${channel.domainSlug}/${channel.slug}`;
        setProcessing(channelId);
        try {
            await onInstall(0, 'channel', channelId);
            await mutateSkill();
        } finally {
            setProcessing(null);
        }
    };

    const handleRemove = async (channelId: string) => {
        setProcessing(channelId);
        try {
            await uninstallSkill(skillSlug, 'channel', channelId);
            await mutateSkill();
        } finally {
            setProcessing(null);
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <Hash className="w-5 h-5 text-secondary" />
                    <h3 className="text-2xl font-serif text-text">Channels</h3>
                </div>
                {isInstalled && (
                    <button
                        onClick={() => setShowPicker(!showPicker)}
                        className="p-2 hover:bg-primary/5 text-primary rounded-full transition-colors"
                        aria-label={showPicker ? 'Close picker' : 'Add to channel'}
                    >
                        {showPicker ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                    </button>
                )}
            </div>

            <div className="bg-surface rounded-3xl border border-surface-active shadow-sm p-6">
                {isGloballyInstalled ? (
                    <p className="text-xs text-text-secondary py-2">
                        Installed globally. Available in every channel for <span className="font-medium text-text">{skillSlug}</span>.
                    </p>
                ) : installedChannels.length > 0 ? (
                    <div className="space-y-1">
                        {installedChannels.map(channelId => (
                            <div key={channelId} className="flex items-center gap-2.5 py-1.5 px-2 rounded-xl hover:bg-surface-hover group transition-colors">
                                <div className="w-7 h-7 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                                    <Hash className="w-3.5 h-3.5 text-secondary" />
                                </div>
                                <span className="text-sm text-text truncate flex-1">{channelId}</span>
                                {processing === channelId ? (
                                    <Loader2 className="w-3.5 h-3.5 text-text-secondary animate-spin shrink-0" />
                                ) : (
                                    <button
                                        onClick={() => handleRemove(channelId)}
                                        className="w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-text-secondary transition-all"
                                        title="Remove from channel"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-6 border-2 border-dashed border-surface-active rounded-xl">
                        <p className="text-xs text-text-secondary italic">
                            {isInstalled ? 'Not installed in any channel yet' : 'Install this skill first to add it to channels'}
                        </p>
                    </div>
                )}

                {showPicker && availableChannels.length === 0 && (
                    <div className="mt-3 pt-3 border-t border-surface-active">
                        <p className="text-xs text-text-secondary italic text-center py-2">
                            {allChannels.length === 0
                                ? 'No channels exist yet. Create one in a project first.'
                                : 'This skill is already in every channel.'}
                        </p>
                    </div>
                )}

                {showPicker && availableChannels.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-surface-active">
                        <p className="text-[10px] font-medium text-text-secondary mb-1.5">Add to channel</p>
                        <div className="space-y-0.5 max-h-48 overflow-y-auto">
                            {(domainsData || []).map(domain => {
                                const domainChannels = domain.channels.filter(ch =>
                                    !installedSet.has(`${domain.slug}/${ch.slug}`)
                                );
                                if (domainChannels.length === 0) return null;
                                return (
                                    <div key={domain.id}>
                                        <p className="text-[9px] font-semibold text-text-secondary uppercase tracking-wider px-2 py-1 mt-1">
                                            {domain.name}
                                        </p>
                                        {domainChannels.map(ch => {
                                            const channelId = `${domain.slug}/${ch.slug}`;
                                            return (
                                                <button
                                                    key={ch.id}
                                                    onClick={() => handleAdd({ slug: ch.slug, domainSlug: domain.slug })}
                                                    disabled={processing === channelId}
                                                    className="w-full flex items-center gap-2.5 py-1.5 px-2 rounded-xl hover:bg-surface-hover transition-colors text-left disabled:opacity-50"
                                                >
                                                    <Hash className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                                                    <span className="text-sm text-text truncate flex-1">{ch.name}</span>
                                                    {processing === channelId ? (
                                                        <Loader2 className="w-3.5 h-3.5 text-text-secondary animate-spin shrink-0" />
                                                    ) : (
                                                        <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// -------------------------------------------------------------------
// Skill Agents Card — add/remove agents, similar to ConnectorsSection
// -------------------------------------------------------------------

function SkillAgentsCard({ isInstalled, agents, installedByAgents, loading }: { isInstalled: boolean; agents: Assistant[]; installedByAgents: number[]; loading?: boolean }) {
    const installedSet = new Set(installedByAgents);
    const assignedAgents = agents.filter(a => installedSet.has(a.id));

    return (
        <div className="bg-surface rounded-3xl border border-surface-active shadow-sm p-6">
            {loading ? (
                <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="flex items-center gap-2.5 py-1.5 animate-pulse">
                            <div className="w-7 h-7 rounded-lg bg-surface-hover" />
                            <div className="h-4 w-24 rounded bg-surface-hover" />
                        </div>
                    ))}
                </div>
            ) : assignedAgents.length > 0 ? (
                <div className="space-y-2">
                    {assignedAgents.map(agent => (
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
                    {isInstalled
                        ? 'This skill is installed to your workspace. All your agents can use it.'
                        : 'Install this skill to make it available to your agents.'}
                </p>
            )}
        </div>
    );
}


