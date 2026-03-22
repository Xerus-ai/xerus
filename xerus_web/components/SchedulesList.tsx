'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Calendar,
  Clock,
  Edit,
  Trash2,
  PlayCircle,
  PauseCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  MoreVertical
} from 'lucide-react';
import { toast } from 'sonner';
import type { ScheduledExecution } from '@/lib/api/types';

interface SchedulesListProps {
  schedules: ScheduledExecution[];
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit?: (schedule: ScheduledExecution) => void;
  isLoading?: boolean;
}

export default function SchedulesList({
  schedules,
  onToggle,
  onDelete,
  onEdit,
  isLoading = false
}: SchedulesListProps) {
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleToggle = async (schedule: ScheduledExecution) => {
    if (!schedule.id) return;

    setTogglingId(schedule.id);
    try {
      await onToggle(schedule.id, !schedule.enabled);
    } catch (error) {
      console.error('Failed to toggle schedule:', error);
      toast.error('Failed to toggle schedule');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (scheduleId: string) => {
    toast('Delete this schedule?', {
      action: {
        label: 'Confirm Delete',
        onClick: async () => {
          setDeletingId(scheduleId);
          try {
            await onDelete(scheduleId);
            toast.success('Schedule deleted');
          } catch (error) {
            console.error('Failed to delete schedule:', error);
            toast.error('Failed to delete schedule');
          } finally {
            setDeletingId(null);
          }
        },
      },
    });
  };

  const formatSchedule = (schedule: ScheduledExecution) => {
    const scheduleType = schedule.scheduleType;
    const scheduleConfig = schedule.scheduleConfig || {};

    switch (scheduleType) {
      case 'once':
        return `Once on ${scheduleConfig.datetime ? new Date(scheduleConfig.datetime).toLocaleDateString() : 'N/A'}`;
      
      case 'daily':
        return `Daily at ${scheduleConfig.time || '09:00'}`;
      
      case 'weekly':
        const days = scheduleConfig.days?.length || 0;
        return `Weekly (${days} day${days !== 1 ? 's' : ''}) at ${scheduleConfig.time || '09:00'}`;
      
      case 'monthly':
        return `Monthly on day ${scheduleConfig.date || 1} at ${scheduleConfig.time || '09:00'}`;
      
      case 'cron':
        return `Custom: ${scheduleConfig.cron || 'N/A'}`;
      
      default:
        return 'Unknown';
    }
  };

  const formatNextRun = (schedule: ScheduledExecution) => {
    const nextRunAt = schedule.nextRunAt;
    if (!nextRunAt) return 'Not scheduled';
    
    const nextRun = new Date(nextRunAt);
    const now = new Date();
    const diffMs = nextRun.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    } else if (diffHours > 0) {
      return `in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
    } else if (diffMins > 0) {
      return `in ${diffMins} minute${diffMins !== 1 ? 's' : ''}`;
    } else if (diffMs > 0) {
      return 'soon';
    } else {
      return 'overdue';
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-[#FF6600] animate-spin" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-100 text-green-800 text-xs">Success</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800 text-xs">Failed</Badge>;
      case 'running':
        return <Badge className="bg-[#FFF4E6] text-[#FF6600] text-xs">Running</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">Never Run</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-[#FF6600] animate-spin" />
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Calendar className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="text-sm font-medium text-text mb-1">No Schedules</h3>
          <p className="text-sm text-text-secondary">
            Create your first schedule to automate this agent's workflow
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {schedules.map((schedule) => (
        <Card key={schedule.id} className={!schedule.enabled ? 'opacity-60' : ''}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-medium text-text">{schedule.name}</h4>
                  {schedule.enabled ? (
                    <Badge className="bg-green-100 text-green-800 text-xs">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">Paused</Badge>
                  )}
                  {schedule.lastStatus && getStatusBadge(schedule.lastStatus)}
                </div>

                {schedule.description && (
                  <p className="text-sm text-text-secondary mb-3">{schedule.description}</p>
                )}

                {/* Warning for schedules without task prompts */}
                {!schedule.taskPrompt && (
                  <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                    ⚠️ Missing task prompt - this schedule will fail to execute. Please delete and recreate with a task prompt.
                  </div>
                )}

                {/* Show last error if execution failed */}
                {schedule.lastError && (
                  <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                    Last error: {schedule.lastError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2 text-text-secondary">
                    <Clock className="w-4 h-4" />
                    <span>{formatSchedule(schedule)}</span>
                  </div>

                  {schedule.enabled && schedule.nextRunAt && (
                    <div className="flex items-center gap-2 text-text-secondary">
                      <Calendar className="w-4 h-4" />
                      <span>Next run: {formatNextRun(schedule)}</span>
                    </div>
                  )}

                  {(schedule.runCount !== undefined && schedule.runCount > 0) && (
                    <div className="flex items-center gap-2 text-text-secondary">
                      {getStatusIcon(schedule.lastStatus)}
                      <span>
                        Ran {schedule.runCount} time{schedule.runCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}

                  <div className="text-xs text-text-muted">
                    {schedule.timezone}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4">
                <Switch
                  checked={schedule.enabled}
                  onCheckedChange={() => handleToggle(schedule)}
                  disabled={togglingId === schedule.id}
                />

                {onEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(schedule)}
                    className="h-8 w-8 p-0"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => schedule.id && handleDelete(schedule.id)}
                  disabled={deletingId === schedule.id}
                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  {deletingId === schedule.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
