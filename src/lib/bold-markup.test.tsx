import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyBold, stripBold } from './bold-markup';

const html = (parts: Parameters<typeof applyBold>[0]) => renderToStaticMarkup(<>{applyBold(parts)}</>);

describe('applyBold', () => {
  it('bolds a pair and hides the stars', () => {
    expect(html(['hello **big** world'])).toBe('hello <strong>big</strong> world');
    expect(html(['**a** and **b c**'])).toBe('<strong>a</strong> and <strong>b c</strong>');
  });

  it('leaves stars that do not pair up alone', () => {
    expect(html(['just **one'])).toBe('just **one');
    expect(html(['2**3 and 4**5'])).toBe('2**3 and 4**5');
    expect(html(['** loose **'])).toBe('** loose **');
    expect(html(['****'])).toBe('****');
    expect(html(['a single * star'])).toBe('a single * star');
  });

  it('does not run across lines', () => {
    expect(html(['**start\nend**'])).toBe('**start\nend**');
  });

  it('wraps elements such as mentions and links', () => {
    const out = html(['hi **', <a key="m" href="/bob">@bob</a>, ' there** ok']);
    expect(out).toBe('hi <strong><a href="/bob">@bob</a> there</strong> ok');
  });

  it('pairs stars split across string parts', () => {
    expect(html(['see *', '*', <a key="l" href="https://x.com">x.com</a>, '**'])).toBe('see <strong><a href="https://x.com">x.com</a></strong>');
  });

  it('never turns text into markup', () => {
    expect(html(['**<img src=x onerror=alert(1)>**'])).toBe('<strong>&lt;img src=x onerror=alert(1)&gt;</strong>');
  });

  it('returns the parts untouched when there is nothing to do', () => {
    const parts = ['plain text'];
    expect(applyBold(parts)).toEqual(parts);
  });
});

describe('stripBold', () => {
  it('drops only paired stars', () => {
    expect(stripBold('hello **big** world')).toBe('hello big world');
    expect(stripBold('2**3 **yes**')).toBe('2**3 yes');
    expect(stripBold('nothing here')).toBe('nothing here');
    expect(stripBold(null)).toBe(null);
  });
});

describe('in the post and chat renderers', () => {
  it('keeps mentions, tags and links working inside bold', async () => {
    const { renderTextWithLinks, renderChatTextWithLinks } = await import('@/components/app/TranslatableText');
    const post = renderToStaticMarkup(<>{renderTextWithLinks('**hey @bob #music riftn.com** done')}</>);
    expect(post).toMatch(/^<strong>hey <a href="\/[^"]*bob[^"]*"[^>]*>@bob<\/a> <a [^>]*>#music<\/a> <a [^>]*>🔗<\/a><\/strong> done$/);
    const chat = renderToStaticMarkup(<>{renderChatTextWithLinks('see **riftn.com** and **@bob**')}</>);
    expect(chat).toContain('<strong><a ');
    expect(chat).toContain('>riftn.com</a></strong>');
    expect(chat).toMatch(/<strong><a [^>]*>@bob<\/a><\/strong>$/);
    expect(chat).not.toContain('**');
  });
});
