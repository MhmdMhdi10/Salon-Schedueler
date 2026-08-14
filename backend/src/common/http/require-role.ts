import type { Request, RequestHandler } from 'express';
import type { Action, ResourceRef } from '../../auth/authorizer.js';

/** Shared controller guard contract, independent from any feature controller. */
export type RequireRole = (
  action: Action,
  resolveResource?: (req: Request) => ResourceRef,
) => RequestHandler;
