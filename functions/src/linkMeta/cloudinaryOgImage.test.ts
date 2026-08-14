import { describe, expect, it } from 'vitest'
import { ogCropUrl } from './cloudinaryOgImage.js'

describe('ogCropUrl', () => {
  it('inserts the 1200x630 crop transform right after /upload/', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/v1700000000/folder/photo.jpg'
    expect(ogCropUrl(url)).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_1200,h_630,q_auto,f_auto/v1700000000/folder/photo.jpg',
    )
  })

  it('returns null for a non-Cloudinary URL', () => {
    expect(ogCropUrl('https://lh3.googleusercontent.com/a/photo.jpg')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(ogCropUrl('')).toBeNull()
  })
})
