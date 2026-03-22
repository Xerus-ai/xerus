'use client';

import { useMemo } from 'react';
import { parseMascotConfig } from '@/lib/mascot-config';
import { renderMascotToDataUrl } from '@/lib/mascot-renderer';

// Module-level cache: config string -> data URL
// Persists for the lifetime of the browser tab
const mascotCache = new Map<string, string>();

interface MascotAvatarProps {
    config: string;
    size?: number;
    className?: string;
    alt?: string;
}

export function MascotAvatar({ config, size = 80, className, alt = 'Agent avatar' }: MascotAvatarProps) {
    const dataUrl = useMemo(() => {
        // Check cache first
        const cacheKey = `${config}:${size}`;
        const cached = mascotCache.get(cacheKey);
        if (cached) return cached;

        // Parse and render
        const parsed = parseMascotConfig(config);
        if (!parsed) return '';

        const url = renderMascotToDataUrl(parsed, size * 2); // 2x for retina
        mascotCache.set(cacheKey, url);
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
