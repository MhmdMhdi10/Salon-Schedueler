export interface PrismaFeatureSchema {
  readonly feature: string;
  readonly persistence: 'prisma';
  readonly models: readonly string[];
}

export function definePrismaFeatureSchema<T extends PrismaFeatureSchema>(
  schema: T,
): T {
  return schema;
}
