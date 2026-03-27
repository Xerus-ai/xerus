'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Loader2, Trash2, Check, Eye, EyeOff, KeyRound } from 'lucide-react';
import { getSkillSecrets, setSkillSecret, deleteSkillSecret } from '@/lib/api/skills';
import type { SkillSecretStatus } from '@/lib/api/types';

interface SkillSecretsCardProps {
    skillSlug: string;
    envKeys: string[];
}

export function SkillSecretsCard({ skillSlug, envKeys }: SkillSecretsCardProps) {
    const { data: secrets, mutate } = useSWR<SkillSecretStatus[]>(
        `skill-secrets-${skillSlug}`,
        () => getSkillSecrets(skillSlug),
    );

    if (envKeys.length === 0) {
        return (
            <div className="bg-surface rounded-[24px] border border-surface-active shadow-sm p-6">
                <p className="text-xs text-text-secondary py-2">This skill does not require any API keys.</p>
            </div>
        );
    }

    const secretMap = new Map((secrets || []).map(s => [s.envKey, s]));

    return (
        <div className="bg-surface rounded-[24px] border border-surface-active shadow-sm p-4 space-y-3">
            {envKeys.map(key => (
                <SecretRow
                    key={key}
                    skillSlug={skillSlug}
                    envKey={key}
                    status={secretMap.get(key)}
                    onSaved={mutate}
                />
            ))}
        </div>
    );
}

function SecretRow({ skillSlug, envKey, status, onSaved }: {
    skillSlug: string;
    envKey: string;
    status?: SkillSecretStatus;
    onSaved: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState('');
    const [saving, setSaving] = useState(false);
    const [showValue, setShowValue] = useState(false);

    const handleSave = async () => {
        if (!value.trim()) return;
        setSaving(true);
        try {
            await setSkillSecret(skillSlug, envKey, value);
            setValue('');
            setEditing(false);
            onSaved();
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setSaving(true);
        try {
            await deleteSkillSecret(skillSlug, envKey);
            onSaved();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-surface-hover rounded-xl px-5 py-4">
            <div className="flex items-center gap-3 mb-2">
                <KeyRound className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                <span className="text-sm font-semibold text-text">{envKey}</span>
                {status?.hasValue && !editing && (
                    <div className="flex items-center gap-2 ml-auto">
                        <span className="text-xs text-text-secondary font-mono">{status.hint}</span>
                        <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <button
                            onClick={handleDelete}
                            disabled={saving}
                            className="text-text-muted hover:text-red-500 transition-colors"
                        >
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                )}
                {!status?.hasValue && !editing && (
                    <div className="flex items-center gap-2 ml-auto">
                        <div className="w-2 h-2 rounded-full bg-surface-active shrink-0" />
                        <span className="text-xs text-text-muted">Not set</span>
                    </div>
                )}
            </div>

            {editing ? (
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <input
                            type={showValue ? 'text' : 'password'}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder={`Enter ${envKey}`}
                            className="w-full px-3 py-2 pr-8 rounded-lg border border-surface-active bg-surface text-sm focus:outline-none focus:border-primary transition-colors"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
                        />
                        <button
                            onClick={() => setShowValue(!showValue)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                        >
                            {showValue ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving || !value.trim()}
                        className="h-9 px-4 bg-text hover:bg-primary rounded-xl text-white flex items-center gap-2 shrink-0 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Save
                    </button>
                    <button
                        onClick={() => { setEditing(false); setValue(''); }}
                        className="h-9 px-3 text-sm text-text-secondary hover:text-text transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => setEditing(true)}
                    className={`h-9 px-4 rounded-xl flex items-center gap-2 shrink-0 text-sm font-medium transition-colors ${
                        status?.hasValue
                            ? 'bg-surface text-text-secondary hover:bg-surface-pressed hover:text-text'
                            : 'bg-text hover:bg-primary text-white'
                    }`}
                >
                    {status?.hasValue ? 'Update' : 'Set key'}
                </button>
            )}
        </div>
    );
}
