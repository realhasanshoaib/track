import type { ReactNode } from 'react'

import { TooltipProvider } from '#/components/ui/tooltip'
import { WebConvexAuthProvider } from '#/components/WebConvexAuthProvider'

export default function AppProviders({
  children,
}: {
  children: ReactNode
}) {
  return (
    <WebConvexAuthProvider>
      <TooltipProvider>{children}</TooltipProvider>
    </WebConvexAuthProvider>
  )
}
