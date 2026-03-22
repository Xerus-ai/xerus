'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ModelIcon } from '@/components/agents/AgentAvatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { isMascotConfig } from '@/lib/mascot-config';
import { MascotAvatar } from '@/components/agents/MascotAvatar';

function AvatarImg({ avatarUrl, name, size }: { avatarUrl?: string; name: string; size: number }) {
  if (isMascotConfig(avatarUrl)) {
    return <MascotAvatar config={avatarUrl!} size={size} className="w-full h-full" alt={name} />;
  }
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={name} className="w-full h-full object-contain" />;
  }
  return (
    <span className="w-full h-full flex items-center justify-center bg-[#FF6600]/10 text-[#FF6600] text-xs font-semibold">
      {name.substring(0, 2).toUpperCase()}
    </span>
  );
}

export interface AvatarData {
  id: number;
  name: string;
  avatarUrl?: string;
  model?: string;
  role?: string;
}

interface AvatarGroupProps {
  avatars: AvatarData[];
  limit?: number;
  size?: 'sm' | 'md' | 'lg';
  showModel?: boolean;
  className?: string;
}


const sizeClasses = {
  sm: 'w-10 h-10 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-14 h-14 text-base',
};

const roundedClasses = {
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
};

const overlapClasses = {
  sm: '-space-x-3',
  md: '-space-x-4',
  lg: '-space-x-5',
};

export function AvatarGroup({
  avatars,
  limit = 4,
  size = 'md',
  showModel = true,
  className,
}: AvatarGroupProps) {
  const visibleAvatars = avatars.slice(0, limit);
  const excess = avatars.length - limit;

  return (
    <div className={cn('flex items-center', overlapClasses[size], className)}>
      {visibleAvatars.map((avatar, index) => (
        <motion.div
          key={avatar.id}
          className="relative cursor-pointer group pt-3 pb-3"
          initial={{ x: -10 * index, opacity: 0, scale: 0.8 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          transition={{
            delay: index * 0.05,
            type: 'spring',
            stiffness: 300,
            damping: 20,
          }}
          whileHover={{
            scale: 1.1,
            zIndex: 50,
            transition: { duration: 0.2 },
          }}
          style={{ zIndex: visibleAvatars.length - index }}
        >
          {/* Name Pill on Top - Hover Only */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-white border border-surface-active rounded-md px-2 py-0.5 shadow-sm z-20 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <span className="text-[9px] font-medium text-text max-w-[60px] truncate block">{avatar.name.split(' ')[0]}</span>
          </div>

          {/* Avatar Image */}
          <div
            className={cn(
              sizeClasses[size],
              roundedClasses[size],
              'overflow-hidden border-2 border-surface-alt ring-1 ring-surface-active shadow-sm transition-shadow group-hover:shadow-md bg-surface-hover'
            )}
          >
            <AvatarImg avatarUrl={avatar.avatarUrl} name={avatar.name} size={48} />
          </div>

          {/* Model Badge - Only on Hover */}
          {showModel && avatar.model && (
            <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 bg-white border border-surface-active rounded-md px-1.5 py-0.5 shadow-sm flex items-center gap-0.5 z-10 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <ModelIcon model={avatar.model} size="sm" />
              <span className="text-[9px] font-medium text-text-secondary max-w-[50px] truncate">{avatar.model}</span>
            </div>
          )}
        </motion.div>
      ))}

      {excess > 0 && (
        <TooltipProvider>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <motion.div
                className="relative cursor-pointer pt-3 pb-3"
                initial={{ x: -10, opacity: 0, scale: 0.8 }}
                animate={{ x: 0, opacity: 1, scale: 1 }}
                transition={{
                  delay: visibleAvatars.length * 0.05,
                  type: 'spring',
                  stiffness: 300,
                  damping: 20,
                }}
                whileHover={{
                  scale: 1.1,
                  zIndex: 50,
                  transition: { duration: 0.2 },
                }}
                style={{ zIndex: 0 }}
              >
                <div
                  className={cn(
                    sizeClasses[size],
                    roundedClasses[size],
                    'flex items-center justify-center',
                    'bg-surface-hover border-2 border-surface-alt ring-1 ring-surface-active',
                    'text-text-secondary font-medium shadow-sm'
                  )}
                >
                  +{excess}
                </div>
              </motion.div>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="bg-white border border-surface-active shadow-xl rounded-xl p-2 min-w-[200px]"
            >
              <div className="flex flex-col gap-1">
                <p className="px-2 py-1 text-xs font-semibold text-text-secondary uppercase tracking-wider border-b border-gray-50 mb-1">
                  {excess} More Member{excess > 1 ? 's' : ''}
                </p>
                {avatars.slice(limit).map((avatar) => (
                  <div key={avatar.id} className="flex items-center gap-3 p-2 hover:bg-surface rounded-lg transition-colors cursor-default">
                    <div className="w-8 h-8 rounded-lg overflow-hidden border border-surface-active bg-surface-hover flex-shrink-0">
                      <AvatarImg avatarUrl={avatar.avatarUrl} name={avatar.name} size={32} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-text truncate">{avatar.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

// Compact version for cards - shows avatars in a row with count
export function AvatarGroupCompact({
  avatars,
  limit = 3,
  size = 'sm',
  className,
}: Omit<AvatarGroupProps, 'showModel'>) {
  const visibleAvatars = avatars.slice(0, limit);
  const excess = avatars.length - limit;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('flex items-center', overlapClasses[size])}>
        {visibleAvatars.map((avatar, index) => (
          <motion.div
            key={avatar.id}
            className="relative"
            initial={{ x: -8, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: index * 0.03 }}
            style={{ zIndex: visibleAvatars.length - index }}
          >
            <div
              className={cn(
                sizeClasses[size],
                roundedClasses[size],
                'overflow-hidden border-2 border-surface-alt ring-1 ring-surface-active bg-surface-hover'
              )}
            >
              <AvatarImg avatarUrl={avatar.avatarUrl} name={avatar.name} size={40} />
            </div>
          </motion.div>
        ))}
      </div>
      {excess > 0 && (
        <span className="text-xs font-medium text-text-secondary">+{excess}</span>
      )}
    </div>
  );
}

export { AvatarGroup as default };
