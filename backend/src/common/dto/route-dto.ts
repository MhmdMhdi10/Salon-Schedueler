import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';

/**
 * Shared DTO primitives used by every HTTP controller.
 *
 * DTOs deliberately use `passthrough()` at the transport boundary. Existing
 * clients may send additive fields (for example honeypot or analytics fields),
 * while declared fields still receive type/shape validation before a service is
 * called.
 */
export const EmptyDto = z.object({}).passthrough();
export const IdParamDto = z.object({ id: z.string().trim().min(1) }).passthrough();
export const SalonIdParamDto = IdParamDto;
export const StaffIdParamDto = z
  .object({ id: z.string().trim().min(1), staffId: z.string().trim().min(1) })
  .passthrough();
export const ServiceIdParamDto = z
  .object({ id: z.string().trim().min(1), serviceId: z.string().trim().min(1) })
  .passthrough();
export const AnyQueryDto = z.record(z.unknown());

export interface ControllerDtoDefinition {
  /** Stable identifier used by coverage reports and controller tests. */
  id: string;
  controller: string;
  method: string;
  path: string;
  params: ZodTypeAny;
  query: ZodTypeAny;
  body: ZodTypeAny;
}

export interface ParsedControllerDto {
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
}

export interface DtoRequest extends Request {
  controllerDto?: ParsedControllerDto;
}

const decodePathSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

/** Match Express-like `:param` patterns without depending on Express internals. */
export function matchesControllerPath(pattern: string, actual: string): boolean {
  const expected = pattern.split('/').filter(Boolean);
  const received = actual.split('/').filter(Boolean);
  if (expected.length !== received.length) return false;
  return expected.every((part, index) => part.startsWith(':') || part === received[index]);
}

/** Extract route parameters from an Express-like controller path pattern. */
export function extractControllerParams(
  pattern: string,
  actual: string,
): Record<string, string> {
  const expected = pattern.split('/').filter(Boolean);
  const received = actual.split('/').filter(Boolean);
  return Object.fromEntries(
    expected
      .map((part, index) => (part.startsWith(':') ? [part.slice(1), decodePathSegment(received[index] ?? '')] : null))
      .filter((entry): entry is [string, string] => entry !== null),
  );
}

function firstIssueField(error: z.ZodError): string {
  const path = error.issues[0]?.path ?? [];
  return path.length > 0 ? path.join('.') : 'body';
}

function validateLocation(
  source: unknown,
  schema: ZodTypeAny,
  location: keyof ParsedControllerDto,
  res: Response,
): unknown | undefined {
  const parsed = schema.safeParse(source ?? {});
  if (!parsed.success) {
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      field: location === 'body' ? firstIssueField(parsed.error) : `${location}.${firstIssueField(parsed.error)}`,
    });
    return undefined;
  }
  return parsed.data;
}

/**
 * Transport middleware used before all API controllers. Every registered route
 * gets params/query/body validation here, so a controller cannot accidentally
 * bypass its DTO by forgetting a local `validateRequired` call.
 */
export function createControllerDtoMiddleware(
  definitions: readonly ControllerDtoDefinition[],
): RequestHandler {
  return (req: DtoRequest, res: Response, next: NextFunction) => {
    const definition = definitions.find(
      (candidate) =>
        candidate.method === req.method && matchesControllerPath(candidate.path, req.path),
    );

    // The coverage test fails on any controller route missing from this registry.
    // Leaving unmatched paths alone keeps health/third-party middleware behavior
    // compatible while making the registry additive during development.
    if (!definition) {
      next();
      return;
    }

    const params = validateLocation(
      extractControllerParams(definition.path, req.path),
      definition.params,
      'params',
      res,
    );
    if (params === undefined) return;

    const query = validateLocation(req.query, definition.query, 'query', res);
    if (query === undefined) return;

    const body = validateLocation(req.body, definition.body, 'body', res);
    if (body === undefined) return;

    req.controllerDto = {
      params: params as Record<string, unknown>,
      query: query as Record<string, unknown>,
      body: body as Record<string, unknown>,
    };
    next();
  };
}

export function defineControllerDto(
  definition: ControllerDtoDefinition,
): ControllerDtoDefinition {
  return definition;
}
