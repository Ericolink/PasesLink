import { Link } from 'react-router-dom'
import type { AuthErrorInfo } from '../utils/firebaseErrorMessages'

export function AuthErrorMessage({ info }: { info: AuthErrorInfo }) {
  return (
    <p className="text-sm text-red-600">
      {info.message}
      {info.actionTo && info.actionLabel && (
        <>
          {' '}
          <Link to={info.actionTo} className="underline font-medium">{info.actionLabel}</Link>
        </>
      )}
    </p>
  )
}
