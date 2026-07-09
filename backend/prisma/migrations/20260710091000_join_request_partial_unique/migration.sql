-- Closes a TOCTOU race identified during release hardening: the app-level
-- check in chapters.routes.ts (look for an existing PENDING row, then
-- create one) is not atomic, so two concurrent "Request to Join" submits
-- from the same user could both pass the check and both insert. A user
-- may still accumulate multiple APPROVED/DENIED rows over time (request,
-- get denied, request again later) — only PENDING must be unique per
-- (chapterId, userId), which is exactly what a partial index expresses and
-- a plain @@unique cannot. Prisma's schema DSL has no way to declare a
-- filtered index, so this exists only here — see the doc comment on
-- ChapterJoinRequest in schema.prisma.
CREATE UNIQUE INDEX "ChapterJoinRequest_chapterId_userId_pending_key"
  ON "ChapterJoinRequest" ("chapterId", "userId")
  WHERE "status" = 'PENDING';
