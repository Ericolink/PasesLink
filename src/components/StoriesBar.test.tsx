import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StoriesBar } from './StoriesBar'
import type { PhotoData } from '../firebase/photos'

// StoriesBar es lo que "identifica al autor" de una foto: agrupa por
// authorToken. Con T4 (P0-4) ese valor pasa a ser SHA-256(qrToken) para los
// invitados — el agrupamiento tiene que seguir funcionando igual.
const HASH_ANA = 'a'.repeat(64)
const HASH_BETO = 'b'.repeat(64)

function photo(id: string, authorName: string, authorToken: string, createdAt: number): PhotoData {
  return {
    id,
    url: `https://res.cloudinary.com/demo/image/upload/${id}.jpg`,
    authorName,
    authorToken,
    createdAt,
    pinned: false,
    reactionCount: 0,
    reactionCountsByType: {},
    replies: [],
  } as PhotoData
}

describe('StoriesBar — agrupación por autor con authorToken hasheado', () => {
  it('groups photos with the same hashed authorToken into a single story', () => {
    render(
      <StoriesBar
        eventId="event-1"
        photos={[
          photo('p1', 'Ana Prueba', HASH_ANA, 1),
          photo('p2', 'Ana Prueba', HASH_ANA, 2),
          photo('p3', 'Beto Prueba', HASH_BETO, 3),
        ]}
      />,
    )

    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /Ana/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Beto/ })).toBeInTheDocument()
  })

  it('keeps two authors with the same display name apart when their hashes differ', () => {
    render(
      <StoriesBar
        eventId="event-1"
        photos={[
          photo('p1', 'Ana Prueba', HASH_ANA, 1),
          photo('p2', 'Ana Prueba', HASH_BETO, 2),
        ]}
      />,
    )

    expect(screen.getAllByRole('button')).toHaveLength(2)
  })
})
