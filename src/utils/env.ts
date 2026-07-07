// Los secrets de build (GitHub Actions → Vite) a veces se cargan con un
// salto de línea de más al final (típico de `gh secret set NOMBRE < archivo`
// o de pegar el valor en la UI de GitHub con un enter de sobra) — Vite los
// inyecta tal cual en el bundle, y ese \n termina codificado como %0A en
// cualquier URL que se arme con ese valor (rompió el iframe de Firebase Auth
// con VITE_FIREBASE_API_KEY/AUTH_DOMAIN, ver commit que agregó este archivo).
// Pasar cada `import.meta.env.VITE_*` por acá evita que un secret mal
// cargado tumbe silenciosamente el login, la subida a Cloudinary, EmailJS o
// Sentry — no reemplaza corregir el secret en sí, pero evita que un espacio
// o salto de línea de más rompa la app hasta que se corrija.
export function cleanEnv(value: string | undefined): string {
  return (value ?? '').trim()
}
