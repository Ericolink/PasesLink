import { useState } from 'react'
import { detectInAppBrowser, buildAndroidChromeIntentUrl } from '../utils/inAppBrowser'

// Lógica del aviso de "navegador integrado" separada de su presentación
// (ver InAppBrowserBanner.tsx) para que GuestPass.tsx pueda decidir cómo
// agruparlo junto al aviso de multi-dispositivo sin duplicar la detección.
export function useInAppBrowserNotice() {
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)
  const { isInApp, appName } = detectInAppBrowser(navigator.userAgent)
  const intentUrl = isInApp ? buildAndroidChromeIntentUrl(window.location.href, navigator.userAgent) : null

  function handleAction() {
    if (intentUrl) {
      window.location.href = intentUrl
      return
    }
    navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true))
  }

  return {
    visible: isInApp && !dismissed,
    appName,
    intentUrl,
    copied,
    dismiss: () => setDismissed(true),
    handleAction,
  }
}
