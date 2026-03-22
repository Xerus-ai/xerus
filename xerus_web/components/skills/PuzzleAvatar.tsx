'use client';

import { useMemo } from 'react';
import { parsePuzzleConfig } from '@/lib/puzzle-config';
import { renderPuzzleToDataUrl } from '@/lib/puzzle-renderer';

// Module-level cache: config string -> data URL
const puzzleCache = new Map<string, string>();

interface PuzzleAvatarProps {
    config: string;
    size?: number;
    className?: string;
    alt?: string;
}

export function PuzzleAvatar({ config, size = 80, className, alt = 'Skill avatar' }: PuzzleAvatarProps) {
    const dataUrl = useMemo(() => {
        if (typeof document === 'undefined') return '';

        const cacheKey = `${config}:${size}`;
        const cached = puzzleCache.get(cacheKey);
        if (cached) return cached;

        const parsed = parsePuzzleConfig(config);
        if (!parsed) return '';

        const url = renderPuzzleToDataUrl(parsed, size * 2);
        puzzleCache.set(cacheKey, url);
        return url;
    }, [config, size]);

    if (!dataUrl) return null;

    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={dataUrl}
            alt={alt}
            width={size}
            height={size}
            className={className}
        />
    );
}
