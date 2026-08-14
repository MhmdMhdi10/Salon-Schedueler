/**
 * Express feature-module descriptor.
 *
 * The backend uses Express + Prisma rather than Nest + Mongoose, so modules
 * describe composition without introducing a second runtime container. Each
 * feature still owns controller, DTO, schema, model and service boundaries like
 * V-House, while `buildApp` remains the single composition root.
 */
export interface FeatureModuleDescriptor {
  readonly name: string;
  readonly controllers: readonly unknown[];
  readonly imports: readonly unknown[];
  readonly providers: readonly unknown[];
  readonly exports: readonly unknown[];
  readonly schemas: readonly unknown[];
  readonly dtoPrefix: string;
  readonly persistence: 'prisma';
}

export function defineFeatureModule<T extends FeatureModuleDescriptor>(module: T): T {
  return module;
}
