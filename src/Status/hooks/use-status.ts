import { useContext } from 'react'
import { StatusContext } from '../context'
import type { StatusContextValue } from '../context'

/** Read the catalogue status published by `<StatusProvider>`. */
export function useStatus(): StatusContextValue {
  const value = useContext(StatusContext)
  if (!value) throw new Error('useStatus must be used inside <StatusProvider>')
  return value
}
