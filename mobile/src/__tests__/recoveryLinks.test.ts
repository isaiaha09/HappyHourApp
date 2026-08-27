import { parseRecoveryDeepLink } from '../recoveryLinks';

describe('parseRecoveryDeepLink', () => {
  it('recognizes the username recovery route', () => {
    expect(parseRecoveryDeepLink('diningdealz://forgot-username/')).toEqual({ kind: 'forgot-username' });
  });

  it('preserves the password reset token from the route', () => {
    expect(parseRecoveryDeepLink('diningdealz://forgot-password/token-ABC-123/')).toEqual({
      kind: 'forgot-password',
      token: 'token-ABC-123',
    });
  });

  it('accepts a query-string password token', () => {
    expect(parseRecoveryDeepLink('diningdealz://forgot-password/?token=token-ABC-123')).toEqual({
      kind: 'forgot-password',
      token: 'token-ABC-123',
    });
  });

  it('parses business profile deep links', () => {
    expect(parseRecoveryDeepLink('diningdealz://place/yard-house')).toEqual({
      kind: 'business-profile',
      slug: 'yard-house',
    });
    expect(parseRecoveryDeepLink('https://www.diningdealz.com/place/yard-house')).toEqual({
      kind: 'business-profile',
      slug: 'yard-house',
    });
  });

  it('ignores unrelated or incomplete links', () => {
    expect(parseRecoveryDeepLink('diningdealz://open')).toBeNull();
    expect(parseRecoveryDeepLink('diningdealz://forgot-password/')).toBeNull();
    expect(parseRecoveryDeepLink('not a url')).toBeNull();
  });
});
