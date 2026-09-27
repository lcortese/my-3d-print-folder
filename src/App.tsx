import { RouterProvider } from 'react-router'
import { StatusProvider } from '@/Status/components/status-provider'
import { AppHeader } from '@/components/app-header'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { router } from './router'

/**
 * Application shell.
 *
 * Every context wrapper is mounted here, then the header and the router: pages
 * have no knowledge of the header at all.
 */
export default function App() {
  return (
    <TooltipProvider delayDuration={250}>
      <StatusProvider>
        <div className="flex h-svh flex-col bg-background text-foreground">
          <AppHeader />
          <RouterProvider router={router} />
        </div>
      </StatusProvider>
      <Toaster theme="system" position="bottom-right" />
    </TooltipProvider>
  )
}
