interface StepDescriptionLocationProps {
  description: string
  onDescriptionChange: (value: string) => void
  dressCode: string
  onDressCodeChange: (value: string) => void
  mapsUrl: string
  onMapsUrlChange: (value: string) => void
  welcomeMessage: string
  onWelcomeMessageChange: (value: string) => void
}

export function StepDescriptionLocation({
  description,
  onDescriptionChange,
  dressCode,
  onDressCodeChange,
  mapsUrl,
  onMapsUrlChange,
  welcomeMessage,
  onWelcomeMessageChange,
}: StepDescriptionLocationProps) {
  return (
    <>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Todo es opcional. Ayuda a tus invitados a saber qué esperar y cómo llegar.
      </p>

      <div className="space-y-5">
        <div>
          <label htmlFor="event-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Descripción
          </label>
          <textarea
            id="event-description"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            rows={4}
            placeholder="Cuéntales a tus invitados más detalles sobre el evento…"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-gray-400 mt-1">
            Se muestra centrada en la invitación, como un texto de tarjeta.
          </p>
        </div>

        <div>
          <label htmlFor="event-welcome-message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Mensaje de bienvenida
          </label>
          <input
            id="event-welcome-message"
            type="text"
            value={welcomeMessage}
            onChange={(e) => onWelcomeMessageChange(e.target.value)}
            placeholder="¡Te esperamos!"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="event-dress-code" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Vestimenta (opcional)
          </label>
          <input
            id="event-dress-code"
            type="text"
            value={dressCode}
            onChange={(e) => onDressCodeChange(e.target.value)}
            maxLength={100}
            placeholder="Ej: Formal, Casual, Todo de blanco…"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="event-maps-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Link de Google Maps
          </label>
          <input
            id="event-maps-url"
            type="url"
            value={mapsUrl}
            onChange={(e) => onMapsUrlChange(e.target.value)}
            placeholder="https://maps.google.com/maps?q=..."
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-gray-400 mt-1">
            Pega el link completo de Google Maps (desde el navegador, no el link corto).
          </p>
        </div>
      </div>
    </>
  )
}
