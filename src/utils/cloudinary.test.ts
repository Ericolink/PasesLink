import { describe, expect, it } from 'vitest'
import { optimizedImageUrl } from './cloudinary'

describe('optimizedImageUrl', () => {
  it('inserts quality/format/width transforms right after /upload/', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/v1700000000/folder/photo.jpg'
    expect(optimizedImageUrl(url, 800)).toBe(
      'https://res.cloudinary.com/demo/image/upload/q_auto,f_auto,w_800/v1700000000/folder/photo.jpg',
    )
  })

  it('leaves non-Cloudinary URLs unchanged', () => {
    const url = 'https://lh3.googleusercontent.com/a/foo=s96-c'
    expect(optimizedImageUrl(url, 200)).toBe(url)
  })

  it('returns falsy input unchanged', () => {
    expect(optimizedImageUrl('', 200)).toBe('')
  })
})
