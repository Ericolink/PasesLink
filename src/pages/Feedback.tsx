import React, { useState } from 'react'
import confetti from 'canvas-confetti'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { submitFeedback } from '../firebase/feedback'
import { FEEDBACK_CATEGORY_LABELS } from '../types'
import type { FeedbackCategory } from '../types'
import { FEEDBACK_EMAIL_MAX, FEEDBACK_MESSAGE_MAX, FEEDBACK_MESSAGE_MIN, FEEDBACK_SUBJECT_MAX } from '../utils/validation'
import { IconCheckCircle } from '../components/Icons'
import { FeedbackCategoryIcon } from '../components/FeedbackCategoryIcon'
import { ScreenHeader } from '../components/ScreenHeader'
import { Button } from '../components/Button'

// Orden pensado para la grilla del formulario, no el orden de FeedbackCategory
// en src/types/index.ts (ahí van agrupados con sus labels).
const CATEGORY_ORDER: FeedbackCategory[] = [
  'suggestion',
  'bug',
  'comment',
  'question',
  'feature_request',
  'inappropriate',
  'other',
]

const inputClass =
  'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary'

export function Feedback() {
  useDocumentTitle('Buzón de sugerencias')
  const { user } = useAuth()
  const { profile } = useUserProfile()
  const backTo = user ? '/profile' : '/'

  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState<FeedbackCategory | null>(null)
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('') // honeypot: un humano nunca lo ve ni lo llena
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  function resetForm() {
    setSubject('')
    setMessage('')
    setCategory(null)
    setEmail('')
    setWebsite('')
    setError('')
    setSent(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!category) {
      setError('Selecciona una categoría para tu comentario.')
      return
    }
    setSubmitting(true)
    try {
      await submitFeedback({
        userId: user?.uid || null,
        userEmail: user ? null : email,
        userDisplayName: user ? profile?.displayName || user.displayName || null : null,
        subject,
        message,
        category,
        honeypot: website,
      })
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 } })
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar tu comentario. Intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))] animate-fade-in">
        <ScreenHeader title="Buzón de sugerencias" backTo={backTo} />
        <div className="text-center py-6">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <IconCheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">¡Gracias por tu comentario!</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Lo recibimos y el equipo de PaseLink lo va a revisar pronto.
        </p>
        <Button onClick={resetForm}>
          Enviar otro comentario
        </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))] animate-fade-in">
      <ScreenHeader title="Buzón de sugerencias" backTo={backTo} />
      <p className="text-sm text-gray-500 dark:text-gray-400 -mt-2 mb-6">
        ¿Encontraste un error, tienes una idea o quieres dejarnos un comentario? Cuéntanos — solo el equipo de
        PaseLink puede ver este mensaje.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Categoría</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CATEGORY_ORDER.map((cat) => {
              const active = category === cat
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  aria-pressed={active}
                  className={`flex flex-col items-center gap-1.5 text-xs font-medium rounded-lg border-2 px-2 py-3 text-center transition-all ${
                    active
                      ? 'border-primary ring-2 ring-primary/20 bg-primary/5 text-primary'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <FeedbackCategoryIcon category={cat} className="w-5 h-5" />
                  {FEEDBACK_CATEGORY_LABELS[cat]}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label htmlFor="fb-subject" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Asunto
          </label>
          <input
            id="fb-subject"
            type="text"
            required
            maxLength={FEEDBACK_SUBJECT_MAX}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Resume tu comentario en pocas palabras"
            className={inputClass}
          />
        </div>

        {!user && (
          <div>
            <label htmlFor="fb-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Tu email
            </label>
            <input
              id="fb-email"
              type="email"
              required
              maxLength={FEEDBACK_EMAIL_MAX}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="para poder responderte si hace falta"
              className={inputClass}
            />
          </div>
        )}

        <div>
          <label htmlFor="fb-message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Mensaje
          </label>
          <textarea
            id="fb-message"
            required
            rows={6}
            minLength={FEEDBACK_MESSAGE_MIN}
            maxLength={FEEDBACK_MESSAGE_MAX}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Cuéntanos con detalle qué pasó o qué te gustaría ver en PaseLink…"
            className={`${inputClass} resize-none`}
          />
          <div className="flex justify-end mt-1">
            <span className="text-xs text-gray-400">
              {message.length}/{FEEDBACK_MESSAGE_MAX}
            </span>
          </div>
        </div>

        {/* Honeypot: invisible para una persona (sr-only + fuera del tab order).
            Un bot que autocompleta todos los inputs del formulario lo delata. */}
        <div className="sr-only" aria-hidden="true">
          <label htmlFor="fb-website">Sitio web</label>
          <input
            id="fb-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Enviando…' : 'Enviar comentario'}
        </Button>
      </form>
    </div>
  )
}
