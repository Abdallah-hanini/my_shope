import { escapeLike } from './like';

describe('escapeLike', () => {
  it('matches %, _ and \\ literally', () => {
    expect(escapeLike('50%_off\\x')).toBe('50\\%\\_off\\\\x');
    expect(escapeLike('Cash')).toBe('Cash');
  });
});
