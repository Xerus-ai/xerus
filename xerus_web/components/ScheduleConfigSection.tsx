'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { WorkflowConfig } from '@/lib/api/types';
import {
  Clock,
  Save,
  Loader2,
  Info,
  Calendar,
  Check
} from 'lucide-react';
import { toast } from '@/lib/toast';

export interface ScheduleConfig {
  time?: string; // "09:00"
  days?: number[]; // [1,3,5] for Mon, Wed, Fri (0=Sunday, 6=Saturday)
  date?: number; // Day of month (1-31)
  datetime?: string; // ISO datetime for "once" type
  cron?: string; // Custom cron expression
}

export interface ScheduledExecution {
  id?: string;
  name: string;
  description?: string;
  agentId: number;
  workflowConfig?: WorkflowConfig;
  scheduleType: 'once' | 'daily' | 'weekly' | 'monthly' | 'cron';
  scheduleConfig: ScheduleConfig;
  timezone: string;
  taskPrompt?: string;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount?: number;
  lastStatus?: 'success' | 'failed' | 'running';
  lastError?: string;
}

interface ScheduleConfigSectionProps {
  agentId: number;
  workflowConfig?: WorkflowConfig;
  onSave: (schedule: ScheduledExecution) => Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
}

const SCHEDULE_TYPES = [
  { id: 'once', name: 'Once', description: 'Run once at a specific date/time' },
  { id: 'daily', name: 'Daily', description: 'Run every day at a specific time' },
  { id: 'weekly', name: 'Weekly', description: 'Run on specific days of the week' },
  { id: 'monthly', name: 'Monthly', description: 'Run on a specific day each month' },
  { id: 'cron', name: 'Custom', description: 'Advanced cron expression' }
] as const;

const DAYS_OF_WEEK = [
  { id: 0, name: 'Sun', fullName: 'Sunday' },
  { id: 1, name: 'Mon', fullName: 'Monday' },
  { id: 2, name: 'Tue', fullName: 'Tuesday' },
  { id: 3, name: 'Wed', fullName: 'Wednesday' },
  { id: 4, name: 'Thu', fullName: 'Thursday' },
  { id: 5, name: 'Fri', fullName: 'Friday' },
  { id: 6, name: 'Sat', fullName: 'Saturday' }
];

const TIMEZONES = [
  { id: 'UTC', name: 'UTC' },
  { id: 'America/New_York', name: 'Eastern Time (ET)' },
  { id: 'America/Chicago', name: 'Central Time (CT)' },
  { id: 'America/Denver', name: 'Mountain Time (MT)' },
  { id: 'America/Los_Angeles', name: 'Pacific Time (PT)' },
  { id: 'Europe/London', name: 'London (GMT)' },
  { id: 'Europe/Paris', name: 'Paris (CET)' },
  { id: 'Asia/Tokyo', name: 'Tokyo (JST)' },
  { id: 'Asia/Shanghai', name: 'Shanghai (CST)' },
  { id: 'Australia/Sydney', name: 'Sydney (AEDT)' }
];

export default function ScheduleConfigSection({
  agentId,
  workflowConfig,
  onSave,
  onCancel,
  disabled = false
}: ScheduleConfigSectionProps) {
  const [schedule, setSchedule] = useState<ScheduledExecution>({
    name: '',
    description: '',
    agentId,
    workflowConfig,
    scheduleType: 'daily',
    scheduleConfig: {
      time: '09:00'
    },
    timezone: 'UTC',
    taskPrompt: '',
    enabled: true
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!schedule.name) {
      toast.error('Name required', { description: 'Give your schedule a name to continue.' });
      return;
    }

    if (!schedule.taskPrompt || schedule.taskPrompt.trim() === '') {
      toast.error('Task prompt required', { description: 'Tell your agent what to do on each run.' });
      return;
    }

    if (schedule.taskPrompt.length > 2000) {
      toast.error('Prompt too long', { description: 'Keep your task prompt under 2,000 characters.' });
      return;
    }

    setIsSaving(true);
    try {
      await onSave(schedule);
      setSchedule({
        name: '',
        description: '',
        agentId,
        workflowConfig,
        scheduleType: 'daily',
        scheduleConfig: { time: '09:00' },
        timezone: 'UTC',
        taskPrompt: '',
        enabled: true
      });
    } catch (error) {
      console.error('Failed to save schedule:', error);
      toast.error("Couldn't save the schedule", { description: 'Please check your settings and try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleDay = (dayId: number) => {
    setSchedule(prev => {
      const currentDays = prev.scheduleConfig.days || [];
      const newDays = currentDays.includes(dayId)
        ? currentDays.filter(d => d !== dayId)
        : [...currentDays, dayId].sort();

      return {
        ...prev,
        scheduleConfig: {
          ...prev.scheduleConfig,
          days: newDays
        }
      };
    });
  };

  const formatNextRun = () => {
    const { scheduleType, scheduleConfig } = schedule;

    switch (scheduleType) {
      case 'once':
        return scheduleConfig.datetime
          ? `On ${new Date(scheduleConfig.datetime).toLocaleString()}`
          : 'Set a date and time';

      case 'daily':
        return `Every day at ${scheduleConfig.time || '09:00'}`;

      case 'weekly':
        if (!scheduleConfig.days || scheduleConfig.days.length === 0) {
          return 'Select days of the week';
        }
        const dayNames = scheduleConfig.days
          .map(d => DAYS_OF_WEEK.find(day => day.id === d)?.name)
          .join(', ');
        return `Every ${dayNames} at ${scheduleConfig.time || '09:00'}`;

      case 'monthly':
        const dayOfMonth = scheduleConfig.date || 1;
        return `Day ${dayOfMonth} of each month at ${scheduleConfig.time || '09:00'}`;

      case 'cron':
        return scheduleConfig.cron || 'Enter cron expression';

      default:
        return 'Configure schedule';
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h3 className="text-base font-medium text-text mb-1">Schedule Execution</h3>
        <p className="text-sm text-text-secondary">
          Set up automatic execution of this agent's workflow
        </p>
      </div>

      <div className="space-y-6">
        {/* Schedule Name */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Schedule Name *
          </label>
          <input
            type="text"
            value={schedule.name}
            onChange={(e) => setSchedule(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., Daily Report Generation"
            disabled={disabled}
            className="w-full px-3 py-2 rounded-lg border border-surface-active text-sm focus:outline-none focus:border-primary transition-colors bg-white text-text placeholder:text-[#9CA3AF]"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Description
          </label>
          <textarea
            value={schedule.description || ''}
            onChange={(e) => setSchedule(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Optional description of what this schedule does..."
            rows={2}
            disabled={disabled}
            className="w-full px-3 py-2 rounded-lg border border-surface-active text-sm focus:outline-none focus:border-primary transition-colors bg-white text-text placeholder:text-[#9CA3AF] resize-none"
          />
        </div>

        {/* Task Prompt */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Task Prompt * <span className="font-normal opacity-70">- What should the agent do?</span>
          </label>
          <textarea
            value={schedule.taskPrompt || ''}
            onChange={(e) => setSchedule(prev => ({ ...prev, taskPrompt: e.target.value }))}
            placeholder="e.g., Generate a summary of yesterday's customer support tickets..."
            rows={4}
            disabled={disabled}
            className="w-full px-3 py-2 rounded-lg border border-surface-active text-sm focus:outline-none focus:border-primary transition-colors bg-white text-text placeholder:text-[#9CA3AF] resize-none"
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-text-secondary">
              {schedule.taskPrompt?.length || 0} / 2000 characters
            </p>
            {schedule.taskPrompt && schedule.taskPrompt.length > 2000 && (
              <p className="text-xs text-red-500">
                Exceeds maximum length
              </p>
            )}
          </div>

          {/* Examples Dropdown */}
          <details className="mt-3 group">
            <summary className="text-xs font-medium text-primary cursor-pointer hover:text-primary/90 transition-colors list-none flex items-center gap-1">
              <span>📋 View example task prompts</span>
            </summary>
            <div className="mt-2 p-3 bg-surface rounded-xl space-y-2 border border-surface-active">
              {[
                { title: '📊 Daily Metrics Report', desc: 'Generate daily summary of key business metrics', prompt: 'Generate a comprehensive daily report summarizing key metrics from yesterday: customer support tickets, sales figures, and system performance. Highlight any critical issues that need immediate attention.' },
                { title: '📱 Social Media Analysis', desc: 'Monitor and analyze social media activity', prompt: 'Analyze social media mentions and sentiment from the past 24 hours. Identify trending topics, positive/negative feedback patterns, and provide recommendations for engagement opportunities.' },
                { title: '🔍 System Health Monitoring', desc: 'Continuous system health checks and alerts', prompt: 'Review system logs and performance metrics from the last hour. Flag any errors, performance degradations, or unusual patterns. Generate alerts for critical issues requiring immediate attention.' },
              ].map((example, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSchedule(prev => ({ ...prev, taskPrompt: example.prompt }))}
                  className="w-full text-left p-2.5 bg-white hover:border-primary rounded-lg border border-surface-active transition-all group/btn"
                  disabled={disabled}
                >
                  <div className="font-medium text-text text-sm group-hover/btn:text-primary transition-colors">{example.title}</div>
                  <div className="text-xs text-text-secondary mt-0.5">{example.desc}</div>
                </button>
              ))}
            </div>
          </details>
        </div>

        {/* Schedule Type */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-2">
            Schedule Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {SCHEDULE_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => setSchedule(prev => ({
                  ...prev,
                  scheduleType: type.id as any,
                  scheduleConfig: type.id === 'weekly' ? { time: '09:00', days: [] } :
                    type.id === 'monthly' ? { time: '09:00', date: 1 } :
                      type.id === 'once' ? { datetime: '' } :
                        type.id === 'cron' ? { cron: '' } :
                          { time: '09:00' }
                }))}
                disabled={disabled}
                className={`p-3 rounded-xl border text-left transition-all ${schedule.scheduleType === type.id
                  ? 'border-primary bg-[#FFF5EB]'
                  : 'border-surface-active bg-white hover:border-primary/50'
                  }`}
              >
                <div className={`font-medium text-sm ${schedule.scheduleType === type.id ? 'text-primary' : 'text-text'}`}>
                  {type.name}
                </div>
                <div className="text-xs text-text-secondary mt-0.5">{type.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Schedule Configuration */}
        <div className="space-y-4 p-4 bg-surface rounded-xl border border-surface-active">
          {schedule.scheduleType === 'once' && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Date & Time
              </label>
              <input
                type="datetime-local"
                value={schedule.scheduleConfig.datetime || ''}
                onChange={(e) => setSchedule(prev => ({
                  ...prev,
                  scheduleConfig: { ...prev.scheduleConfig, datetime: e.target.value }
                }))}
                disabled={disabled}
                className="w-full px-3 py-2 rounded-lg border border-surface-active text-sm focus:outline-none focus:border-primary transition-colors bg-white text-text"
              />
            </div>
          )}

          {(schedule.scheduleType === 'daily' || schedule.scheduleType === 'weekly' || schedule.scheduleType === 'monthly') && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                <Clock className="w-3 h-3 inline mr-1" />
                Time
              </label>
              <input
                type="time"
                value={schedule.scheduleConfig.time || '09:00'}
                onChange={(e) => setSchedule(prev => ({
                  ...prev,
                  scheduleConfig: { ...prev.scheduleConfig, time: e.target.value }
                }))}
                disabled={disabled}
                className="w-full px-3 py-2 rounded-lg border border-surface-active text-sm focus:outline-none focus:border-primary transition-colors bg-white text-text"
              />
            </div>
          )}

          {schedule.scheduleType === 'weekly' && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">
                Days of Week
              </label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => (
                  <button
                    key={day.id}
                    onClick={() => toggleDay(day.id)}
                    disabled={disabled}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${schedule.scheduleConfig.days?.includes(day.id)
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-text-secondary border-surface-active hover:border-primary hover:text-primary'
                      }`}
                  >
                    {day.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {schedule.scheduleType === 'monthly' && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Day of Month
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={schedule.scheduleConfig.date || 1}
                onChange={(e) => setSchedule(prev => ({
                  ...prev,
                  scheduleConfig: { ...prev.scheduleConfig, date: parseInt(e.target.value) }
                }))}
                disabled={disabled}
                className="w-full px-3 py-2 rounded-lg border border-surface-active text-sm focus:outline-none focus:border-primary transition-colors bg-white text-text"
              />
            </div>
          )}

          {schedule.scheduleType === 'cron' && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Cron Expression
              </label>
              <input
                value={schedule.scheduleConfig.cron || ''}
                onChange={(e) => setSchedule(prev => ({
                  ...prev,
                  scheduleConfig: { ...prev.scheduleConfig, cron: e.target.value }
                }))}
                placeholder="0 9 * * *"
                disabled={disabled}
                className="w-full px-3 py-2 rounded-lg border border-surface-active text-sm focus:outline-none focus:border-primary transition-colors bg-white text-text font-mono"
              />
              <p className="text-xs text-text-secondary mt-1">
                Format: minute hour day month weekday (e.g., "0 9 * * *" = 9:00 AM daily)
              </p>
            </div>
          )}
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Timezone
          </label>
          <select
            value={schedule.timezone}
            onChange={(e) => setSchedule(prev => ({ ...prev, timezone: e.target.value }))}
            disabled={disabled}
            className="w-full px-3 py-2 rounded-lg border border-surface-active text-sm focus:outline-none focus:border-primary transition-colors bg-white text-text"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.id} value={tz.id}>
                {tz.name}
              </option>
            ))}
          </select>
        </div>

        {/* Preview */}
        <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-2xl">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Info className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-text">{formatNextRun()}</div>
            <div className="text-xs text-text-secondary/70 mt-0.5">Timezone: {schedule.timezone}</div>
          </div>
        </div>

        {/* Enabled Toggle */}
        <div className="flex items-center justify-between p-3 bg-surface rounded-xl border border-surface-active">
          <div>
            <div className="text-sm font-medium text-text">Enable Schedule</div>
            <div className="text-xs text-text-secondary">Start executing this schedule immediately after saving</div>
          </div>
          <Switch
            checked={schedule.enabled}
            onCheckedChange={(enabled) => setSchedule(prev => ({ ...prev, enabled }))}
            disabled={disabled}
            className="data-[state=checked]:bg-primary"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Button
            onClick={onCancel}
            disabled={disabled || isSaving}
            variant="outline"
            className="px-6 py-2.5 rounded-[12px] border border-surface-active text-text hover:bg-surface font-medium text-sm transition-colors"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || disabled || !schedule.name}
            className="px-6 py-2.5 rounded-[12px] bg-text hover:bg-[#1a1a1a] text-white font-medium text-sm shadow-sm transition-colors flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Schedule'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
