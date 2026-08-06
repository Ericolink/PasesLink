import { describe, expect, it } from 'vitest'
import { getFunctionsErrorMessage } from './firebaseErrorMessages'

describe('getFunctionsErrorMessage', () => {
  it('replaces the raw "internal" that @firebase/functions synthesizes when a call never reaches the backend', () => {
    // Mismo objeto que produce un bloqueo de CSP contra *.cloudfunctions.net:
    // FunctionsError('internal', 'internal') — código y mensaje son el
    // mismo texto crudo.
    const err = { code: 'functions/internal', message: 'internal' }
    expect(getFunctionsErrorMessage(err, 'fallback')).toBe(
      'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.',
    )
  })

  it('also catches the case where the client synthesizes the error with no message at all', () => {
    const err = { code: 'functions/unavailable', message: '' }
    expect(getFunctionsErrorMessage(err, 'fallback')).toBe(
      'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
    )
  })

  it('passes through a real backend message untouched (HttpsError always sends one distinct from the bare code)', () => {
    const err = { code: 'functions/invalid-argument', message: 'El nombre es obligatorio.' }
    expect(getFunctionsErrorMessage(err, 'fallback')).toBe('El nombre es obligatorio.')
  })

  it('falls back to the caller-provided message for an unmapped functions/* code with no useful message', () => {
    const err = { code: 'functions/out-of-range', message: 'out-of-range' }
    expect(getFunctionsErrorMessage(err, 'fallback amigable')).toBe('fallback amigable')
  })

  it('uses err.message for a plain Error unrelated to Cloud Functions', () => {
    expect(getFunctionsErrorMessage(new Error('Este evento no permite acompañantes.'), 'fallback')).toBe(
      'Este evento no permite acompañantes.',
    )
  })

  it('uses the fallback for a non-Error value', () => {
    expect(getFunctionsErrorMessage('boom', 'fallback amigable')).toBe('fallback amigable')
  })
})
