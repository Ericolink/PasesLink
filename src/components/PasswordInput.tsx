import { useId, useState } from 'react'
import { IconEye, IconEyeOff } from './Icons'

interface Props {
  id?: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  minLength?: number
  required?: boolean
  placeholder?: string
  ariaLabel?: string
  className?: string
}

export function PasswordInput({ id, value, onChange, autoComplete, minLength, required, placeholder, ariaLabel, className }: Props) {
  const [visible, setVisible] = useState(false)
  const generatedId = useId()
  const inputId = id || generatedId

  return (
    <div className="relative">
      <input
        id={inputId}
        type={visible ? 'text' : 'password'}
        required={required}
        autoComplete={autoComplete}
        minLength={minLength}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className || 'w-full border border-gray-300 rounded-md pl-3 pr-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary'}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-gray-400 hover:text-gray-600"
      >
        {visible ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
      </button>
    </div>
  )
}
