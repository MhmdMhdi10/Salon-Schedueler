import { z, type ZodTypeAny } from 'zod';
import {
  AnyQueryDto,
  EmptyDto,
  defineControllerDto,
  type ControllerDtoDefinition,
} from './route-dto.js';

export type ControllerHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const pathParam = z.string().trim().min(1);

/** Build a params DTO for any Express path parameters owned by a controller. */
export const controllerPathParams = (...names: string[]): ZodTypeAny =>
  z
    .object(Object.fromEntries(names.map((name) => [name, pathParam])))
    .passthrough();

/**
 * Route-level DTO declaration used by feature-local controller DTO files.
 * Keeping this beside the feature DTOs mirrors V-House's controller → dto
 * ownership while remaining framework-neutral for Express + Prisma.
 */
export const controllerRouteDto = (
  controller: string,
  id: string,
  method: ControllerHttpMethod,
  path: string,
  params: ZodTypeAny = EmptyDto,
  query: ZodTypeAny = AnyQueryDto,
  body: ZodTypeAny = EmptyDto,
): ControllerDtoDefinition =>
  defineControllerDto({ controller, id, method, path, params, query, body });
