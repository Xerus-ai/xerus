'use client'

import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { toast } from 'sonner'
import {
  createSchedule,
  getSchedules,
} from '@/lib/api/schedules'

interface UseScheduleHandlersArgs {
  agentId: number
  setSchedules: Dispatch<SetStateAction<any[] | null>>
  setAgent: Dispatch<SetStateAction<any>>
}

export function useScheduleHandlers({
  agentId,
  setSchedules,
}: UseScheduleHandlersArgs) {
  const handleScheduleCreate = useCallback(async (scheduleData: any) => {
    try {
      await createSchedule(scheduleData)
      const updatedSchedules = await getSchedules({ agentId })
      setSchedules(updatedSchedules)
    } catch (error) {
      console.error('Failed to create schedule:', error)
      toast.error("Couldn't create the schedule", { description: 'Please check your settings and try again.' })
    }
  }, [agentId, setSchedules])

  const handleScheduleToggle = useCallback(async (scheduleId: string, enabled: boolean) => {
    const { toggleSchedule } = await import('@/lib/api/schedules')
    try {
      await toggleSchedule(scheduleId, enabled)
      const updatedSchedules = await getSchedules({ agentId })
      setSchedules(updatedSchedules)
    } catch (error) {
      console.error('Failed to toggle schedule:', error)
      toast.error("Couldn't update the schedule", { description: 'Please try again.' })
    }
  }, [agentId, setSchedules])

  const handleScheduleDelete = useCallback(async (scheduleId: string) => {
    const { deleteSchedule } = await import('@/lib/api/schedules')
    try {
      await deleteSchedule(scheduleId)
      setSchedules((prev) => (prev ?? []).filter((s) => s.id !== scheduleId))
    } catch (error) {
      console.error('Failed to delete schedule:', error)
      toast.error("Couldn't remove the schedule", { description: 'Please try again.' })
    }
  }, [setSchedules])

  return {
    handleScheduleCreate,
    handleScheduleToggle,
    handleScheduleDelete,
  }
}
