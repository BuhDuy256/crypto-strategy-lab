// Request identifier middleware.
//
// Every inbound HTTP request gets a request identifier: the one carried
// in the `x-request-id` header if present, otherwise a newly generated
// one. The identifier is echoed back on the response and made available
// to the structured logger for the rest of the request's async chain.

import { randomUUID } from "node:crypto";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { runWithRequestId } from "./request-context.js";

export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Picks the request identifier to use for a request: the inbound header
 * value if it is present and non-blank, otherwise a freshly generated one.
 *
 * `generateId` is injectable so tests can assert generation without
 * depending on real random output.
 */
export function resolveRequestId(
  headerValue: string | string[] | undefined,
  generateId: () => string = randomUUID
): string {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (raw !== undefined && raw.trim() !== "") {
    return raw;
  }
  return generateId();
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
    res.setHeader(REQUEST_ID_HEADER, requestId);
    runWithRequestId(requestId, () => next());
  }
}
