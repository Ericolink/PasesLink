import { ORNAMENTS } from '../templates/ornaments.map'
import { ThemeOrnament } from './ThemeOrnament'
import type { TemplateId } from '../types'

interface Props {
  templateId?: TemplateId
}

export function InviteDivider({ templateId }: Props) {
  const hasOrnament = !!templateId && !!ORNAMENTS[templateId]
  return (
    <div className="relative my-5 flex items-center justify-center" role="separator">
      <span className="invite-divider-line w-full border-t" style={{ borderColor: 'var(--invite-border)' }} />
      {hasOrnament && (
        <span className="absolute px-2" style={{ backgroundColor: 'var(--invite-page-bg)' }}>
          <ThemeOrnament templateId={templateId} />
        </span>
      )}
    </div>
  )
}
