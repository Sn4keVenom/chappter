// backend/lib/asyncHandler.ts
//
// Express 4 does NOT forward a rejected Promise from an async route handler
// to the error-handling middleware — the request just hangs until the
// client times out, and the rejection becomes an `unhandledRejection` on the
// process (which crashes the whole server on modern Node unless something
// else is listening for it). Every route file had async handlers with zero
// try/catch, so a single unexpected Prisma error (bad input shape, a unique
// constraint hit by a race, a dropped connection) could take the entire API
// down for every chapter, not just the request that hit it.
//
// Wrap every async handler with this so thrown/rejected errors reach
// server.ts's global error handler instead.

import { NextFunction, Request, Response } from "express";

type AsyncRouteHandler<Req extends Request = Request> = (
  req: Req,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

export function asyncHandler<Req extends Request = Request>(
  fn: AsyncRouteHandler<Req>
) {
  return (req: Req, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
