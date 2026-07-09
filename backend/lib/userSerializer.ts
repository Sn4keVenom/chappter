// backend/lib/userSerializer.ts
//
// Single place that flattens a User + their active ChapterMembership into
// the wire shape the mobile app expects (see src/types/index.ts User —
// same field names, just resolved from two tables instead of one). Used by
// auth.routes.ts (/auth/sync), users.routes.ts (/users/me, /users/:id, the
// roster), and chapters.routes.ts (redeem/approve, which change which
// membership is active) so the flattening logic exists exactly once.

import { UserRole, ExecOffice, MemberStatus } from "@prisma/client";

export interface FlattenableUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
}

export interface FlattenableMembership {
  chapterId: string;
  role: UserRole;
  office: ExecOffice | null;
  status: MemberStatus;
  roleNumber: number | null;
  pledgeClassLabel: string | null;
  major: string | null;
  graduationYear: number | null;
}

export function flattenUser(
  user: FlattenableUser,
  membership: FlattenableMembership | null,
  committeeChairOf: string[] = []
) {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    hasChapter: !!membership,
    chapterId: membership?.chapterId ?? null,
    role: membership?.role,
    office: membership?.office ?? undefined,
    status: membership?.status,
    roleNumber: membership?.roleNumber ?? null,
    pledgeClassLabel: membership?.pledgeClassLabel ?? null,
    major: membership?.major ?? null,
    graduationYear: membership?.graduationYear ?? null,
    committeeChairOf,
  };
}
