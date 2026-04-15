'use client'

import React from 'react';
import { MoreHorizontal, FileText, HardDrive, User } from 'lucide-react';

// --- Utility Components ---

// Renders the Avatar group for shared access
export const AccessAvatars = ({ users = [], max = 4 }: { users?: string[], max?: number }) => {
    const visibleUsers = users.slice(0, max);
    const hiddenCount = users.length - max;

    // Placeholder avatars (since we can't load external images)
    const getAvatarColor = (name: string) => {
        const hash = name.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0);
        const colors = ['bg-red-400', 'bg-green-400', 'bg-yellow-400', 'bg-purple-400', 'bg-pink-400', 'bg-blue-400'];
        return colors[hash % colors.length];
    };

    return (
        <div className="flex -space-x-2">
            {visibleUsers.map((user, index) => (
                <div
                    key={index}
                    className={`w-5 h-5 rounded-full ring-2 ring-primary ${getAvatarColor(user)} text-xs font-bold text-white flex items-center justify-center border border-white/10`}
                    style={{ zIndex: users.length - index, transform: 'scale(1.05)' }}
                >
                    {user[0]}
                </div>
            ))}
            {hiddenCount > 0 && (
                <div
                    className="w-5 h-5 rounded-full ring-2 ring-primary bg-text/55 text-[10px] font-medium text-white flex items-center justify-center border border-white/10"
                    style={{ zIndex: 0 }}
                >
                    +{hiddenCount}
                </div>
            )}
        </div>
    );
};

// --- SVG Definitions (Blur filter is still defined but not used) ---

export const FolderSvgDefinitions = () => (
    <svg width="0" height="0" className="absolute pointer-events-none" aria-hidden="true">
        <defs>
            <symbol id="nano-banana-curve" viewBox="64 96 512 416" preserveAspectRatio="none">
                <path
                    d="M 64 512 L 576 512 L 576 208 C 576 172.7 547.3 144 512 144 L 362.7 144 C 355.8 144 349 141.8 343.5 137.6 L 305.1 108.8 C 294 100.5 280.5 96 266.7 96 L 128 96 C 92.7 96 64 124.7 64 160 L 64 512 Z"
                    fill="currentColor"
                />
            </symbol>

            <symbol id="folder-gloss" viewBox="64 96 512 416" preserveAspectRatio="none">
                <path
                    d="M128 96 L266.7 96 C280.5 96 294 100.5 305.1 108.8 L343.5 137.6 C349 141.8 355.8 144 362.7 144 L512 144 L512 180 L64 180 L64 160 C64 124.7 92.7 96 128 96 Z"
                    fill="white"
                    fillOpacity="0.15"
                />
            </symbol>

            {/* Filter is still defined, but no longer applied to any visible SVG layer below */}
            <filter id="svg-blur-filter">
                <feGaussianBlur in="SourceGraphic" stdDeviation="18" />
            </filter>
        </defs>
    </svg>
);

interface FolderCardProps {
    title?: string;
    fileCount?: string | number;
    storageUsed?: string;
    accessUsers?: string[];
    delay?: string;
    onClick?: () => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    className?: string;
}

// 2. Updated Compact Folder Card Component
export const FolderCard = ({
    title = "Work files",
    fileCount = "2.3K",
    storageUsed = "1.4 GB",
    accessUsers = [],
    delay = "0",
    onClick,
    onContextMenu,
    className
}: FolderCardProps) => {
    // Custom warm background color matching the design system cards (e.g., bg-amber-50)
    const cardBgColor = 'bg-surface-hover';
    const folderIconColor = 'text-text group-hover:text-primary transition-colors duration-300'; // Dark default, Orange on hover

    return (
        <div
            className={`relative group w-full h-44 perspective-1000 rounded-2xl cursor-pointer ${className || ''}`}
            style={{ transitionDelay: delay }}
            onClick={onClick}
            onContextMenu={onContextMenu}
        >
            <div
                className={`relative w-full h-full transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)] 
                   group-hover:-translate-y-2 group-hover:shadow-2xl rounded-2xl shadow-xl ${cardBgColor} 
                   overflow-hidden preserve-3d border border-surface-active/50`}
            >

                {/* A. BACK PLATE - Warm Card Color with Shadow (Matching Pricing Divs) */}
                {/* Changed bg-white to use cardBgColor to match the pricing tiers */}
                <div className={`absolute inset-0 ${cardBgColor} h-full w-full shadow-sm`} />

                {/* B. STACKED PAPERS — scaled for h-36 */}
                <div className="absolute top-[10%] left-0 w-full h-full pointer-events-none px-3 z-10">
                    <div className="relative w-full h-full perspective-1000">
                        <div className="absolute top-0 right-4 w-16 h-20 bg-card/40 rounded transform rotate-12 shadow-sm backdrop-blur-[2px] border border-card/20 transition-all duration-500 ease-out group-hover:rotate-[15deg] group-hover:-translate-y-2 group-hover:translate-x-1 origin-bottom-left" />
                        <div className="absolute top-1 right-6 w-16 h-20 bg-card/70 rounded transform rotate-6 shadow-md backdrop-blur-[1px] border border-card/30 flex flex-col p-2 gap-1 transition-all duration-500 ease-out group-hover:rotate-[8deg] group-hover:-translate-y-3 group-hover:translate-x-1 origin-bottom-left">
                            <div className="w-full h-0.5 bg-surface-active/50 rounded-full" />
                            <div className="w-2/3 h-0.5 bg-surface-active/50 rounded-full" />
                        </div>
                        <div className="absolute top-2 right-8 w-16 h-20 bg-card rounded transform -rotate-3 shadow-lg border border-card/60 flex flex-col p-2 gap-1 transition-all duration-500 ease-out group-hover:-rotate-2 group-hover:-translate-y-4 group-hover:scale-[1.01] origin-bottom-left">
                            <div className="w-5 h-5 rounded-full bg-surface mb-0.5 flex items-center justify-center text-surface-active">
                                <FileText size={10} strokeWidth={2} />
                            </div>
                            <div className="w-full h-1 bg-surface-hover rounded-full" />
                            <div className="w-3/4 h-1 bg-surface-hover rounded-full" />
                        </div>
                    </div>
                </div>

                {/* C. FRONT FLAP - SUBTLE ANIMATION (OPAQUE FOLDER) */}
                <div
                    className="absolute inset-0 z-20 flex flex-col justify-end pointer-events-none transition-all duration-500 ease-out origin-bottom"
                    style={{ transformStyle: 'preserve-3d' }}
                >
                    {/* Subtle Animation container */}
                    <div
                        className="relative w-full h-[82%] pointer-events-auto transition-transform duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)] group-hover:[transform:rotateX(-10deg)_translateY(0px)_scale(1.005)] origin-bottom"
                    >

                        {/* 1. Shadow Layer (Stays at the bottom) */}
                        <svg className="absolute inset-0 w-full h-full text-black/20 translate-y-1 blur-md transform scale-[1.02]">
                            <use href="#nano-banana-curve" />
                        </svg>

                        {/* 2. OPAQUE Color Fill (Solid Dark Color - matched to the rich text color) */}
                        <svg className={`absolute inset-0 w-full h-full ${folderIconColor} z-20`}> {/* Orange for folder icon */}
                            <use href="#nano-banana-curve" />
                        </svg>

                        {/* 3. Gloss */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none mix-blend-overlay opacity-40 transition-opacity duration-500 group-hover:opacity-60 z-30">
                            <use href="#folder-gloss" />
                        </svg>

                        {/* Content Overlay — compact for h-36 */}
                        <div className="absolute inset-0 px-3 pt-6 pb-0 text-white flex flex-col justify-end z-40">

                            {/* Folder Title */}
                            <div className="flex justify-between items-center mb-1" style={{ backfaceVisibility: 'hidden' }}>
                                <h2 className="text-sm font-semibold tracking-tight text-white leading-tight truncate pr-2">{title}</h2>
                                <button className="p-1 -mr-1 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors pointer-events-auto" aria-label="More options">
                                    <MoreHorizontal size={14} />
                                </button>
                            </div>

                            {/* Border line */}
                            <div className="h-px bg-white/10 pointer-events-none" style={{ backfaceVisibility: 'hidden' }} />


                            {/* Status bar — compact */}
                            <div
                                className="w-full text-white/80 py-1.5 flex justify-between items-center z-50"
                                style={{ backfaceVisibility: 'hidden' }}
                            >
                                <div className="flex items-center gap-1">
                                    <HardDrive size={10} className="text-white/50" />
                                    <span className="text-[10px] font-medium">{storageUsed}</span>
                                    <span className="text-[10px] text-white/40 ml-1">{fileCount} Files</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <AccessAvatars users={accessUsers} max={2} />
                                    <User size={8} className="text-white/30" />
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
};
