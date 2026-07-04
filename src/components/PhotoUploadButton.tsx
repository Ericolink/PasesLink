import { usePhotoUpload, PHOTO_CAPTION_MAX } from '../hooks/usePhotoUpload'
import { IconCamera, IconRotateCcw, IconX, IconCheck } from './Icons'

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
    queue, retryItem, dismissItem,
  } = usePhotoUpload(eventId, authorName, authorToken, onUploaded)

  const activeCount = queue.filter((q) => q.status !== 'done').length

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled || uploading}
        className="flex items-center gap-1 text-xs rounded-full px-3 py-1 font-medium transition-all bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50"
      >
        <IconCamera className="w-3 h-3" />
        {uploading ? `Subiendo${activeCount > 1 ? ` (${activeCount})` : '…'}` : 'Foto'}
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onFileSelected} />

      {uploadError && <p className="text-xs text-red-500 basis-full">{uploadError}</p>}

      {/* Bandeja de subidas en curso/fallidas — solo se llena con selección
          múltiple (una sola foto usa el modal de descripción de abajo, que
          sube directo sin pasar visiblemente por la bandeja). */}
      {queue.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm space-y-1.5">
          {queue.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-xl px-3 py-2 shadow-lg"
              style={{ background: 'var(--invite-surface, #1a1130)', border: '1px solid var(--invite-border, rgba(144,102,200,.35))' }}
            >
              <img src={item.previewUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs truncate" style={{ color: 'var(--invite-text, #f6f4f9)' }}>
                  {item.status === 'error' ? item.error || 'No se pudo subir.' : item.fileName}
                </p>
                {(item.status === 'uploading' || item.status === 'compressing') && (
                  <div className="h-1 rounded-full overflow-hidden mt-1" style={{ background: 'var(--invite-border, rgba(144,102,200,.35))' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${item.status === 'compressing' ? 5 : Math.max(5, item.progress)}%`, background: 'var(--invite-accent, #FF1464)' }}
                    />
                  </div>
                )}
              </div>
              {item.status === 'done' && <IconCheck className="w-4 h-4 text-green-400 shrink-0" />}
              {item.status === 'error' && (
                <button onClick={() => retryItem(item.id)} aria-label="Reintentar" className="p-1 text-white/70 hover:text-white shrink-0">
                  <IconRotateCcw className="w-4 h-4" />
                </button>
              )}
              {(item.status === 'done' || item.status === 'error') && (
                <button onClick={() => dismissItem(item.id)} aria-label="Descartar" className="p-1 text-white/50 hover:text-white shrink-0">
                  <IconX className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

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
