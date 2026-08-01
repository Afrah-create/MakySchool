'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ManualMarkPayload,
  TeacherAttendanceSettingsPatch,
  TeacherClockCoords,
} from '@makyschool/shared';
import { teacherAttendanceApi } from '@/lib/api/teacherAttendance';

export const teacherAttendanceKeys = {
  settings: ['teacher-attendance', 'settings'] as const,
  myStatus: ['teacher-attendance', 'my-status'] as const,
  today: (date?: string) => ['teacher-attendance', 'today', date ?? ''] as const,
  history: (filters: string) =>
    ['teacher-attendance', 'history', filters] as const,
  teacher: (id: string, month?: string) =>
    ['teacher-attendance', 'teacher', id, month ?? ''] as const,
  map: (date?: string) => ['teacher-attendance', 'map', date ?? ''] as const,
};

export function useTeacherAttendanceSettings(enabled = true) {
  return useQuery({
    queryKey: teacherAttendanceKeys.settings,
    queryFn: () => teacherAttendanceApi.getSettings(),
    enabled,
    staleTime: 30_000,
  });
}

export function useUpdateTeacherAttendanceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TeacherAttendanceSettingsPatch) =>
      teacherAttendanceApi.updateSettings(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['teacher-attendance'] });
    },
  });
}

export function useTeacherMyStatus(enabled = true) {
  return useQuery({
    queryKey: teacherAttendanceKeys.myStatus,
    queryFn: () => teacherAttendanceApi.myStatus(),
    enabled,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useTeacherAttendanceToday(date?: string, enabled = true) {
  return useQuery({
    queryKey: teacherAttendanceKeys.today(date),
    queryFn: () => teacherAttendanceApi.today(date),
    enabled,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useTeacherAttendanceHistory(
  filters: {
    teacherId?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    page?: number;
    limit?: number;
  },
  enabled = true,
) {
  const key = JSON.stringify(filters);
  return useQuery({
    queryKey: teacherAttendanceKeys.history(key),
    queryFn: () => teacherAttendanceApi.history(filters),
    enabled,
    staleTime: 15_000,
  });
}

export function useTeacherAttendanceDetail(
  teacherId: string,
  month?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: teacherAttendanceKeys.teacher(teacherId, month),
    queryFn: () => teacherAttendanceApi.teacherDetail(teacherId, month),
    enabled: enabled && !!teacherId,
    staleTime: 15_000,
  });
}

export function useTeacherAttendanceMap(date?: string, enabled = true) {
  return useQuery({
    queryKey: teacherAttendanceKeys.map(date),
    queryFn: () => teacherAttendanceApi.mapData(date),
    enabled,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useTeacherClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (coords: TeacherClockCoords) =>
      teacherAttendanceApi.clockIn(coords),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: teacherAttendanceKeys.myStatus });
    },
  });
}

export function useTeacherClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (coords: TeacherClockCoords) =>
      teacherAttendanceApi.clockOut(coords),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: teacherAttendanceKeys.myStatus });
    },
  });
}

export function useManualMarkTeacherAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ManualMarkPayload) =>
      teacherAttendanceApi.manualMark(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['teacher-attendance'] });
    },
  });
}
