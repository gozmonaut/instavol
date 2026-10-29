import { cleanArticleHtml } from '@/lib/articleHtml';

const BYLINE = "Terrence O'Brien";
const FIRST_PARAGRAPH =
  "The MPC Sample Key isn't even formally announced yet, but Akai is already showing off what the modding community is cooking up through vibe coding.";

// Modelled on what Readability keeps of a Verge article: series links, author photo and bio above the story.
const vergeLike = `
  <div>
    <div><span>Part Of</span><a href="https://www.theverge.com/ai">All the latest in AI 'music'</a><a href="https://www.theverge.com/ai">see all updates</a></div>
    <div class="author-card"><img src="https://cdn.example/people/terrence.jpg" alt=""></div>
    <p>${BYLINE} is the Verge's weekend editor. He's covered the tech industry for over 18 years and knows a thing or two about synths.</p>
    <figure><img src="https://cdn.example/hero.jpg" alt="De MPC Sample Key"><figcaption>Foto: Akai</figcaption></figure>
    <p>${FIRST_PARAGRAPH} <a href="https://example.com/hackers">explosion of hackers</a></p>
    <p>It will likely run some version of the same software found on the MPC Sample.</p>
  </div>`;

test('drops the series links, author photo and bio before the story, and keeps the lead image', () => {
  const html = cleanArticleHtml(vergeLike, 'https://www.theverge.com/news/1', BYLINE)!;
  expect(html).not.toContain('Part Of');
  expect(html).not.toContain('see all updates');
  expect(html).not.toContain('terrence.jpg');
  expect(html).not.toContain('weekend editor');
  expect(html).toContain('hero.jpg');
  expect(html).toContain('Foto: Akai');
  expect(html).toContain(FIRST_PARAGRAPH);
  expect(html).toContain('same software found on the MPC Sample');
});

test('a bio is recognised with or without "By" in the byline', () => {
  const html = cleanArticleHtml(vergeLike, 'https://www.theverge.com/news/1', `By ${BYLINE}`)!;
  expect(html).not.toContain('weekend editor');
});

test('link lists later in the story are kept', () => {
  const html = cleanArticleHtml(
    `<p>${FIRST_PARAGRAPH}</p><ul><li><a href="https://a.example">Bron A</a></li><li><a href="https://b.example">Bron B</a></li></ul>`,
    'https://example.com/a',
    null,
  )!;
  expect(html).toContain('Bron A');
});

test('removes scripts, event handlers, styles and javascript: links', () => {
  const html = cleanArticleHtml(
    `<p style="color:red" onclick="steal()">${FIRST_PARAGRAPH}</p><script>steal()</script>`
      + '<img src="https://cdn.example/x.jpg" onerror="steal()"><a href="javascript:steal()">klik</a><iframe src="https://evil.example"></iframe>',
    'https://example.com/a',
    null,
  )!;
  expect(html).not.toMatch(/steal|style=|iframe|javascript:/);
  expect(html).toContain('klik');
});

test('links open in a new tab and images load lazily without a referrer', () => {
  const html = cleanArticleHtml(
    `<p>${FIRST_PARAGRAPH} <a href="https://example.com/x">link</a></p><img src="https://cdn.example/x.jpg">`,
    'https://example.com/a',
    null,
  )!;
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noreferrer noopener"');
  expect(html).toContain('loading="lazy"');
  expect(html).toContain('referrerpolicy="no-referrer"');
});

test('an image with only a srcset gets the first one as src, relative to the page', () => {
  const html = cleanArticleHtml(
    `<p>${FIRST_PARAGRAPH}</p><picture><source srcset="/img/large.jpg 2x, /img/small.jpg 1x"><img alt="foto"></picture>`,
    'https://example.com/news/a',
    null,
  )!;
  expect(html).toContain('src="https://example.com/img/large.jpg"');
  expect(html).not.toContain('srcset');
});

test('headings become h2 at most, since the reader shows the title as h1', () => {
  const html = cleanArticleHtml(`<h1>Tussenkop</h1><p>${FIRST_PARAGRAPH}</p>`, 'https://example.com/a', null)!;
  expect(html).toContain('<h2>Tussenkop</h2>');
  expect(html).not.toContain('<h1');
});

test('returns null when nothing is left', () => {
  expect(cleanArticleHtml('<script>x()</script>', 'https://example.com/a', null)).toBeNull();
});

test('the same image twice (another size or crop) is shown once, with its caption', () => {
  const html = cleanArticleHtml(
    '<img src="https://cdn.example/uploads/vox-app.jpg?w=2400&crop=0,0,100,100">'
      + '<figure><img src="https://cdn.example/uploads/vox-app.jpg?w=1200"><figcaption>Bijschrift</figcaption></figure>'
      + `<p>${FIRST_PARAGRAPH}</p><img src="https://cdn.example/uploads/tweede.jpg">`,
    'https://example.com/a',
    null,
  )!;
  expect(html.match(/vox-app\.jpg/g)).toHaveLength(1);
  expect(html).not.toContain('Bijschrift');
  expect(html).toContain('tweede.jpg');
});

test('an image and its <noscript> copy are shown once', () => {
  const html = cleanArticleHtml(
    `<noscript><img src="https://cdn.example/hero.jpg"></noscript><img src="https://cdn.example/hero.jpg?w=800"><p>${FIRST_PARAGRAPH}</p>`,
    'https://example.com/a',
    null,
  )!;
  expect(html.match(/hero\.jpg/g)).toHaveLength(1);
});

test('images told apart only by their query (no image file name) are both kept', () => {
  const html = cleanArticleHtml(
    `<p>${FIRST_PARAGRAPH}</p><img src="https://cdn.example/image?id=1"><img src="https://cdn.example/image?id=2">`,
    'https://example.com/a',
    null,
  )!;
  expect(html).toContain('id=1');
  expect(html).toContain('id=2');
});
