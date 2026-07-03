import type { FC } from 'react'
import type { TemplateId } from '../types'
import {
  WeddingOrnament,
  CowboyOrnament,
  GraduationOrnament,
  KidsOrnament,
  FormalOrnament,
  HousePartyOrnament,
  type OrnamentProps,
} from './ornaments'

export const ORNAMENTS: Partial<Record<TemplateId, FC<OrnamentProps>>> = {
  wedding: WeddingOrnament,
  cowboy: CowboyOrnament,
  graduation: GraduationOrnament,
  kids: KidsOrnament,
  formal: FormalOrnament,
  houseparty: HousePartyOrnament,
}
