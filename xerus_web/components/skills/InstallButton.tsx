'use client';

import { useState, useRef, useEffect } from 'react';
import useSWR from 'swr';
import type { Skill, SkillDetail, Assistant } from '@/lib/api/types';
import { apiCall } from '@/lib/api/client';
import { AgentAvatarWithModel } from '@/components/agents/AgentAvatar';
import { Check, ChevronDown, ChevronRight, Globe, Hash, Loader2, X, ArrowLeft, Bot } from 'lucide-react';

interface Domain {
    id: string;
    slug: string;
    name: string;
    channels: Array<{ id: string; slug: string; name: string; agent_count: number }>;
}

const fetchDomains = async (): Promise<Domain[]> => {
    const response = await apiCall('/company/domains', { method: 'GET' });
    const result = await response.json();
    const data = result.data || result;
    return data.domains || [];
};

type Step = 'pick' | 'channel' | 'agents';

interface InstallButtonProps {
    skill: Skill | SkillDetail;
    agents: Assistant[];
    onInstall: (agentId: number, scope: 'channel' | 'global', channelId?: string) => Promise<void>;
    onUninstall: (agentId: number) => Promise<void>;
    compact?: boolean;
}

export function InstallButton({ skill, agents, onInstall, onUninstall, compact }: InstallButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                className={compact
                    ? "flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-medium py-2.5 rounded-xl text-sm shadow-sm transition-all w-full"
                    : "flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-medium px-5 py-2.5 rounded-xl text-sm shadow-sm transition-all"
                }
            >
                Install
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-surface border border-surface-active rounded-2xl shadow-lg z-50 overflow-hidden p-4" onClick={(e) => e.stopPropagation()}>
                    <InstallFlow
                        skill={skill}
                        agents={agents}
                        onInstall={onInstall}
                        onUninstall={onUninstall}
                        onClose={() => setIsOpen(false)}
                    />
                </div>
            )}
        </div>
    );
}

interface InstallOverlayProps {
    skill: Skill | SkillDetail;
    agents: Assistant[];
    onInstall: (agentId: number, scope: 'channel' | 'global', channelId?: string) => Promise<void>;
    onUninstall: (agentId: number) => Promise<void>;
    isOpen: boolean;
    onClose: () => void;
}

export function InstallOverlay({ skill, agents, onInstall, onUninstall, isOpen, onClose }: InstallOverlayProps) {
    return (
        <div
            className={`absolute inset-0 z-20 rounded-4xl overflow-hidden transition-all duration-300 ${
                isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="absolute inset-0 bg-surface/80 backdrop-blur-sm" />
            <div className={`absolute inset-x-0 bottom-0 flex flex-col transition-transform duration-300 ease-out ${
                isOpen ? 'translate-y-0' : 'translate-y-full'
            }`}>
                <div className="overflow-hidden px-4 pb-4 pt-3">
                    <div className="flex justify-between items-center mb-2">
                        <span className="font-serif text-xl text-text pl-1">Install skill</span>
                        <button
                            onClick={onClose}
                            className="w-6 h-6 rounded-full bg-surface-hover hover:bg-surface-pressed flex items-center justify-center transition-colors"
                        >
                            <X className="w-3.5 h-3.5 text-text-secondary" />
                        </button>
                    </div>
                    <InstallFlow
                        skill={skill}
                        agents={agents}
                        onInstall={onInstall}
                        onUninstall={onUninstall}
                        onClose={onClose}
                    />
                </div>
            </div>
        </div>
    );
}

interface InstallFlowProps {
    skill: Skill | SkillDetail;
    agents: Assistant[];
    onInstall: (agentId: number, scope: 'channel' | 'global', channelId?: string) => Promise<void>;
    onUninstall: (agentId: number) => Promise<void>;
    onClose: () => void;
}

function InstallFlow({ skill, agents, onInstall, onUninstall, onClose }: InstallFlowProps) {
    const [step, setStep] = useState<Step>('pick');
    const [installing, setInstalling] = useState<number | null>(null);
    const [globalInstalling, setGlobalInstalling] = useState(false);

    const { data: domains } = useSWR(step === 'channel' ? 'company-domains' : null, fetchDomains);

    const installedByAgents = 'installedByAgents' in skill ? (skill as SkillDetail).installedByAgents : [];
    const installedAgentIds = new Set(installedByAgents || []);
    const hasAgents = agents.length > 0;

    const handleGlobalInstall = async () => {
        setGlobalInstalling(true);
        try {
            await onInstall(hasAgents ? agents[0].id : 0, 'global');
            onClose();
        } finally {
            setGlobalInstalling(false);
        }
    };

    const handleChannelInstall = async (channelSlug: string, domainSlug: string) => {
        const channelPath = `${domainSlug}/${channelSlug}`;
        setGlobalInstalling(true);
        try {
            await onInstall(hasAgents ? agents[0].id : 0, 'channel', channelPath);
            onClose();
        } finally {
            setGlobalInstalling(false);
        }
    };

    const handleAgentInstall = async (agentId: number) => {
        setInstalling(agentId);
        try {
            await onInstall(agentId, 'global');
        } finally {
            setInstalling(null);
        }
    };

    const handleAgentUninstall = async (agentId: number) => {
        setInstalling(agentId);
        try {
            await onUninstall(agentId);
        } finally {
            setInstalling(null);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Step 1: Pick install type */}
            {step === 'pick' && (
                <div className="space-y-1.5">
                    {/* Global */}
                    <button
                        onClick={handleGlobalInstall}
                        disabled={globalInstalling}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-hover transition-colors text-left disabled:opacity-50"
                    >
                        <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center shrink-0">
                            {globalInstalling ? <Loader2 className="w-4 h-4 animate-spin text-text-secondary" /> : <Globe className="w-4 h-4 text-text-secondary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text">Global</p>
                            <p className="text-[10px] text-text-secondary">All agents see it everywhere</p>
                        </div>
                    </button>

                    {/* Channel */}
                    <button
                        onClick={() => setStep('channel')}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-hover transition-colors text-left"
                    >
                        <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                            <Hash className="w-4 h-4 text-secondary" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text">Channel</p>
                            <p className="text-[10px] text-text-secondary">Only agents in that channel</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-text-secondary shrink-0" />
                    </button>

                    {/* Agent — only show when user has agents */}
                    {hasAgents && (
                        <button
                            onClick={() => setStep('agents')}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-hover transition-colors text-left"
                        >
                            <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center shrink-0">
                                <Bot className="w-4 h-4 text-text-secondary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-text">Agent</p>
                                <p className="text-[10px] text-text-secondary">Pick specific agents</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-text-secondary shrink-0" />
                        </button>
                    )}
                </div>
            )}

            {/* Step 2a: Channel picker */}
            {step === 'channel' && (
                <div className="flex flex-col h-full">
                    <button onClick={() => setStep('pick')} className="flex items-center gap-1.5 text-[11px] text-text-secondary hover:text-text mb-2 transition-colors">
                        <ArrowLeft className="w-3 h-3" /> Back
                    </button>
                    <p className="text-[11px] font-medium text-text-secondary mb-2">Pick a channel</p>
                    <div className="flex-1 overflow-y-auto space-y-0.5 -mx-1 px-1">
                        {!domains && (
                            <div className="py-4 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-text-secondary" /></div>
                        )}
                        {domains?.map(domain => (
                            <div key={domain.id}>
                                <p className="text-[9px] font-semibold text-text-secondary uppercase tracking-wider px-2 py-1 mt-1">{domain.name}</p>
                                {domain.channels.map(ch => (
                                    <button
                                        key={ch.id}
                                        onClick={() => handleChannelInstall(ch.slug, domain.slug)}
                                        disabled={globalInstalling}
                                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-hover transition-colors text-left disabled:opacity-50"
                                    >
                                        <Hash className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                                        <span className="text-sm text-text truncate flex-1">{ch.name}</span>
                                        {globalInstalling ? (
                                            <Loader2 className="w-3 h-3 animate-spin text-text-secondary shrink-0" />
                                        ) : ch.agent_count > 0 ? (
                                            <span className="text-[10px] text-text-secondary shrink-0">{ch.agent_count} agents</span>
                                        ) : null}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Step 2b: Agent picker */}
            {step === 'agents' && (
                <div className="flex flex-col h-full">
                    <button onClick={() => setStep('pick')} className="flex items-center gap-1.5 text-[11px] text-text-secondary hover:text-text mb-2 transition-colors">
                        <ArrowLeft className="w-3 h-3" /> Back
                    </button>
                    <p className="text-[11px] font-medium text-text-secondary mb-2">Assign to agents</p>
                    <div className="flex-1 overflow-y-auto space-y-0.5 -mx-1 px-1">
                        {agents.map(agent => {
                            const isInstalled = installedAgentIds.has(agent.id);
                            const isProcessing = installing === agent.id;
                            return (
                                <button
                                    key={agent.id}
                                    onClick={() => isInstalled ? handleAgentUninstall(agent.id) : handleAgentInstall(agent.id)}
                                    disabled={isProcessing}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-hover transition-colors text-left disabled:opacity-50"
                                >
                                    <AgentAvatarWithModel agent={agent} size="sm" hideBadge />
                                    <span className="text-sm font-medium text-text truncate flex-1">{agent.name}</span>
                                    {isProcessing ? (
                                        <Loader2 className="w-3.5 h-3.5 text-text-secondary animate-spin shrink-0" />
                                    ) : isInstalled ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    ) : (
                                        <span className="text-[10px] text-text-secondary">Add</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
