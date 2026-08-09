export const PARTICIPANT_STATUS = {
  active: 'active',
  blocked: 'blocked',
} as const;

export type IParticipantStatus =
  (typeof PARTICIPANT_STATUS)[keyof typeof PARTICIPANT_STATUS];


