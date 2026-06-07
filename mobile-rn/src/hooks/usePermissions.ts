import { useMemo } from 'react'
import { useAuth } from '../state/AuthContext'
import { createPermissionChecker } from '../utils/permissions'

export function usePermissions() {
  const { user } = useAuth()
  return useMemo(() => createPermissionChecker(user), [user])
}
