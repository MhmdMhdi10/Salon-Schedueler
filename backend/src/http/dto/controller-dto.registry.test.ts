import {
  CONTROLLER_DTO_COUNT,
  CONTROLLER_DTO_DEFINITIONS,
  CONTROLLER_DTO_KEYS,
} from './controller-dto.registry.js';

describe('controller DTO registry', () => {
  it('defines one DTO contract for every controller method', () => {
    expect(CONTROLLER_DTO_COUNT).toBe(126);
    expect(CONTROLLER_DTO_DEFINITIONS).toHaveLength(CONTROLLER_DTO_COUNT);
    expect(new Set(CONTROLLER_DTO_DEFINITIONS.map(({ id }) => id)).size).toBe(
      CONTROLLER_DTO_COUNT,
    );
    expect(CONTROLLER_DTO_KEYS.size).toBe(125);
  });

  it('uses explicit params, query, and body schemas on every definition', () => {
    for (const definition of CONTROLLER_DTO_DEFINITIONS) {
      expect(definition.controller).toMatch(/Controller$/);
      expect(definition.params).toBeDefined();
      expect(definition.query).toBeDefined();
      expect(definition.body).toBeDefined();
    }
  });
});
