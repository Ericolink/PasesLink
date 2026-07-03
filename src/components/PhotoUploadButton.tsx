import { usePhotoUpload, PHOTO_CAPTION_MAX } from '../hooks/usePhotoUpload'
import { IconCamera } from './Icons'

interface Props {
  eventId: string
  authorName: string
  authorToken: string
  onUploaded?: () => void
  disabled?: boolean
}

// Botón "+ Foto" pensado para vivir dentro de la fila de tipos de mensaje del
// formulario del muro (comment/question/music/idea) — mismo tratamiento
// visual de pill, para que subir una foto se sienta como una acción más de
// publicar, no una sección aparte.
export function PhotoUploadButton({ eventId, authorName, authorToken, onUploaded, disabled }: Props) {
  const {
    fileRef, uploading, uploadError, caption, setCaption, pendingFile,
    openPicker, onFileSelected, confirmUpload, cancelUpload,
  } = usePhotoUpload(eventId, authorName, authorToken, onUploaded)

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled || uploading}
        className="flex items-center gap-1 text-xs rounded-full px-3 py-1 font-medium transition-all bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50"
      >
        <IconCamera className="w-3 h-3" />
        {uploading ? 'Subiendo…' : 'Foto'}
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />

      {uploadError && <p className="text-xs text-red-500 basis-full">{uploadError}</p>}

      {pendingFile && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-sm rounded-2xl p-5 space-y-3"
            style={{ background: 'var(--invite-surface, #1a1130)', border: '1px solid var(--invite-border, rgba(144,102,200,.35))' }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--invite-text, #f6f4f9)' }}>
              ¿Querés agregar una descripción a la foto?
            </p>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={PHOTO_CAPTION_MAX}
              placeholder="Opcional…"
              className="w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2"
              style={{
                background: 'var(--invite-page-bg, #150D1C)',
                borderColor: 'var(--invite-border, rgba(144,102,200,.35))',
                color: 'var(--invite-text, #f6f4f9)',
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={cancelUpload}
                className="flex-1 text-sm py-2 rounded-lg border transition-opacity hover:opacity-70"
                style={{ borderColor: 'var(--invite-border, rgba(144,102,200,.35))', color: 'var(--invite-text-muted, #a89fb3)' }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmUpload}
                className="flex-1 text-sm py-2 rounded-lg font-medium transition-opacity hover:opacity-80 text-white"
                style={{ background: 'var(--invite-accent, #FF1464)' }}
              >
                Subir foto
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
