'use client';

import React, { useState, useCallback } from 'react';
import type { Skill, Assistant } from '@/lib/api/types';
import { InstallOverlay } from './InstallButton';
import { Download, Settings } from 'lucide-react';

interface SkillCardProps {
    skill: Skill;
    onClick?: () => void;
    agents?: Assistant[];
    onInstall?: (agentId: number, scope: 'channel' | 'global', channelId?: string) => Promise<void>;
    onUninstall?: (agentId: number) => Promise<void>;
    isInstalled?: boolean;
}

export function SkillCard({ skill, onClick, agents = [], onInstall, onUninstall, isInstalled }: SkillCardProps) {
    const showInstall = onInstall && onUninstall;
    const [installOpen, setInstallOpen] = useState(false);

    const handleInstallClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setInstallOpen(true);
    }, []);

    return (
        <div
            className="bg-surface hover:bg-surface-hover rounded-[32px] p-6 shadow-sm relative group h-full min-h-[260px] transition-all duration-300 cursor-pointer flex flex-col overflow-hidden"
            onClick={onClick}
        >
            {/* Name + Description */}
            <div className="mb-4 flex-1">
                <h3 className="font-serif text-xl text-text group-hover:text-primary transition-colors line-clamp-1 mb-2" title={skill.name}>
                    {skill.name}
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed line-clamp-3">
                    {skill.description || 'No description available.'}
                </p>
            </div>

            {/* Meta row */}
            <div className="flex justify-end items-center mb-4">
                <div className="flex items-center gap-2">
                    {skill.installCount > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-text-secondary">
                            <Download className="w-3 h-3" />
                            {skill.installCount}
                        </span>
                    )}
                    {skill.category && (
                        <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-primary/10 text-primary capitalize">
                            {skill.category}
                        </span>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className={`mt-auto grid gap-3 ${showInstall ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <button
                    onClick={(e) => { e.stopPropagation(); onClick?.(); }}
                    className="flex items-center justify-center gap-2 bg-surface-hover hover:bg-surface-pressed text-text font-medium py-2.5 rounded-xl text-sm transition-colors"
                >
                    <Settings className="w-4 h-4 text-text-secondary" />
                    Manage
                </button>
                {showInstall && !isInstalled && (
                    <button
                        onClick={handleInstallClick}
                        className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-medium py-2.5 rounded-xl text-sm shadow-sm transition-all"
                    >
                        Install
                    </button>
                )}
                {isInstalled && onUninstall && (
                    <button
                        onClick={async (e) => {
                            e.stopPropagation();
                            await onUninstall(0);
                        }}
                        className="flex items-center justify-center gap-2 bg-black hover:bg-[#1a1a1a] text-white font-medium py-2.5 rounded-xl text-sm shadow-sm transition-all"
                    >
                        Uninstall
                    </button>
                )}
            </div>

            {/* Install overlay */}
            {showInstall && (
                <InstallOverlay
                    skill={skill}
                    agents={agents}
                    onInstall={onInstall}
                    onUninstall={onUninstall}
                    isOpen={installOpen}
                    onClose={() => setInstallOpen(false)}
                />
            )}
        </div>
    );
}

