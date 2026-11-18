import { describe, expect, it } from 'vitest';
import { parsePartnerLinkUrl } from './partnerLinkUrl';

describe('parsePartnerLinkUrl', () => {
  it('reads the code from the app scheme and the web link', () => {
    expect(parsePartnerLinkUrl('growl://p/ab12cd')).toBe('AB12CD');
    expect(parsePartnerLinkUrl('https://letsgrow.lu/p/AB12CD')).toBe('AB12CD');
    expect(parsePartnerLinkUrl('https://www.letsgrow.lu/p/AB12CD/?utm=x')).toBe('AB12CD');
    expect(parsePartnerLinkUrl('growl://p/AB%2012')).toBe('AB12');
  });

  it('ignores other links', () => {
    expect(parsePartnerLinkUrl('growl://invite/AB12')).toBeNull();
    expect(parsePartnerLinkUrl('growl://p/')).toBeNull();
    expect(parsePartnerLinkUrl('https://evil.example/p/AB12')).toBeNull();
    expect(parsePartnerLinkUrl(null)).toBeNull();
  });
});
