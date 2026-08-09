export const REGISTER_WITH = {
  google: 'google',
  apple: 'apple',
  credentials: 'credentials',
} as const

export const registerWith = [
  REGISTER_WITH.google,
  REGISTER_WITH.apple,
  REGISTER_WITH.credentials,
]

export const USER_STATUS = {
  pending: 'pending',
  active: 'active',
  blocked: 'blocked',
} as const
 
export const USER_ROLE = {
  admin: 'admin',
  vendor: 'vendor',
  rider: 'rider',
  agent: 'agent',
  user: 'user',
} as const

import type { IUserRole } from '@/app/modules/user/user.types'

export const AUTHENTICATED_ROLES: IUserRole[] = Object.values(USER_ROLE)


