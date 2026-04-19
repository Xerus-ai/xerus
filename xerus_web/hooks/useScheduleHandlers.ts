'use client'

import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { toast } from '@/lib/toast'
import type { ScheduledExecution } from '@/lib/api/types'
import {
  createSchedule,
  updateSchedule,
  deleteSchedule,
  type ScheduleEntry,
} from '@/lib/api/schedules'

// Convert frontend schedule config to an RRULE string for the 9to5 scheduler
function buildRruleFromSchedule(schedule: ScheduledExecution): string | undefined {
  const { scheduleType, scheduleConfig } = schedule

  switch (scheduleType) {
    case 'cron':
      // The 9to5 scheduler also accepts cron; pass through as-is.
      // The backend's rrule parser handles RRULE format; for cron-style
      // input, we convert to a basic RRULE approximation.
      if (scheduleConfig.cron) {
        return scheduleConfig.cron
      }
      return undefined

    case 'daily': {
      const [hour, minute] = (scheduleConfig.time ?? '09:00').split(':').map(Number)
      return `FREQ=DAILY;BYHOUR=${hour};BYMINUTE=${minute};BYSECOND=0`
    }

    case 'weekly': {
      const [hour, minute] = (scheduleConfig.time ?? '09:00').split(':').map(Number)
      const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
      const days = (scheduleConfig.days ?? []).map(d => dayMap[d]).join(',')
      if (!days) return `FREQ=WEEKLY;BYHOUR=${hour};BYMINUTE=${minute};BYSECOND=0`
      return `FREQ=WEEKLY;BYDAY=${days};BYHOUR=${hour};BYMINUTE=${minute};BYSECOND=0`
    }

    case 'monthly': {
      const [hour, minute] = (scheduleConfig.time ?? '09:00').split(':').map(Number)
      const day = scheduleConfig.date ?? 1
      return `FREQ=MONTHLY;BYMONTHDAY=${day};BYHOUR=${hour};BYMINUTE=${minute};BYSECOND=0`
    }

    case 'once':
      // One-time schedules don't use RRULE; the next_run_at is set directly
      return undefined

    default:
      return undefined
  }
}

interface UseScheduleHandlersArgs {
  agentId: number
  agentSlug: string
  // Current visible list — used to seed local state on the very first mutation,
  // otherwise `setSchedules(prev => prev ? ... : prev)` silently drops the
  // update because `localSchedules` is still null until something is set.
  schedules: ScheduledExecution[]
  setSchedules: Dispatch<SetStateAction<ScheduledExecution[] | null>>
}

export function useScheduleHandlers({
  agentId,
  agentSlug,
  schedules,
  setSchedules,
}: UseScheduleHandlersArgs) {
  const slug = agentSlug

  const handleScheduleCreate = useCallback(async (scheduleData: ScheduledExecution) => {
    const rrule = buildRruleFromSchedule(scheduleData)

    const result = await createSchedule({
      agent_slug: slug,
      name: scheduleData.name,
      prompt: scheduleData.taskPrompt ?? scheduleData.description ?? '',
      rrule,
    })

    // Map backend ScheduleEntry to frontend ScheduledExecution for local state
    const created = mapEntryToScheduledExecution(result.schedule, agentId)
    setSchedules(prev => [...(prev ?? schedules), created])
    toast.success('Schedule created')
  }, [slug, agentId, schedules, setSchedules])

  const handleScheduleUpdate = useCallback(async (scheduleId: string, scheduleData: ScheduledExecution) => {
    const rrule = buildRruleFromSchedule(scheduleData)

    const result = await updateSchedule(scheduleId, {
      name: scheduleData.name,
      prompt: scheduleData.taskPrompt ?? scheduleData.description ?? '',
      ...(rrule !== undefined ? { rrule } : {}),
    })

    const updated = mapEntryToScheduledExecution(result.schedule, agentId)
    setSchedules(prev => (prev ?? schedules).map(s => s.id === scheduleId ? updated : s))
    toast.success('Schedule updated')
  }, [agentId, schedules, setSchedules])

  const handleScheduleToggle = useCallback(async (scheduleId: string, enabled: boolean) => {
    const newStatus = enabled ? 'active' : 'paused'

    const result = await updateSchedule(scheduleId, { status: newStatus })

    setSchedules(prev => (prev ?? schedules).map(s =>
      s.id === scheduleId
        ? { ...s, enabled: result.schedule.status === 'active' }
        : s
    ))
    toast.success(enabled ? 'Schedule activated' : 'Schedule paused')
  }, [schedules, setSchedules])

  const handleScheduleDelete = useCallback(async (scheduleId: string) => {
    await deleteSchedule(scheduleId)

    setSchedules(prev => (prev ?? schedules).filter(s => s.id !== scheduleId))
    toast.success('Schedule deleted')
  }, [schedules, setSchedules])

  return {
    handleScheduleCreate,
    handleScheduleUpdate,
    handleScheduleToggle,
    handleScheduleDelete,
  }
}

/** Map a backend ScheduleEntry to the frontend ScheduledExecution shape */
function mapEntryToScheduledExecution(
  entry: ScheduleEntry,
  agentId: number,
): ScheduledExecution {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.prompt,
    agentId,
    scheduleType: 'cron',
    scheduleConfig: { cron: entry.rrule ?? undefined },
    timezone: 'UTC',
    enabled: entry.status === 'active',
    taskPrompt: entry.prompt,
    lastRunAt: entry.last_run_at ? new Date(entry.last_run_at * 1000).toISOString() : undefined,
    nextRunAt: entry.next_run_at ? new Date(entry.next_run_at * 1000).toISOString() : undefined,
  }
}
