import { echapperLike } from './echapper-like.js';

describe('echapperLike', () => {
  it('échappe %, _ et \\', () => {
    expect(echapperLike('100%')).toBe('100\\%');
    expect(echapperLike('Lune_')).toBe('Lune\\_');
    expect(echapperLike('a\\b')).toBe('a\\\\b');
  });

  it('laisse le reste intact', () => {
    expect(echapperLike('Lampe de bureau')).toBe('Lampe de bureau');
  });
});
