/** Documento del editor → HTML seguro. El HTML lo arma el servidor; nada del navegador pasa crudo. */
import { describe, expect, it } from 'vitest';
import { documentoDesdeTexto, enlaceSeguro, procesarDocumento, type Nodo } from '../src/lib/documento.js';

const doc = (...content: Nodo[]): Nodo => ({ type: 'doc', content });
const p = (...content: Nodo[]): Nodo => ({ type: 'paragraph', content });
const t = (text: string, marks?: Nodo['marks']): Nodo => ({ type: 'text', text, ...(marks ? { marks } : {}) });

describe('procesarDocumento', () => {
  it('arma HTML, texto y menciones de un documento normal', () => {
    const r = procesarDocumento(
      doc(
        { type: 'heading', attrs: { level: 2 }, content: [t('Brief')] },
        p(t('Hola '), { type: 'mention', attrs: { id: 'u1', label: 'María' } }, t(', revisa '), t('esto', [{ type: 'bold' }])),
        { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('Logo'))] }, { type: 'listItem', content: [p(t('Paleta'))] }] },
        p(t('Ver '), t('la web', [{ type: 'link', attrs: { href: 'https://lucuma.agency/x' } }]))
      )
    );
    expect(r.html).toBe(
      '<h2>Brief</h2>' +
        '<p>Hola <span class="mencion" data-id="u1">@María</span>, revisa <strong>esto</strong></p>' +
        '<ul><li><p>Logo</p></li><li><p>Paleta</p></li></ul>' +
        '<p>Ver <a href="https://lucuma.agency/x" target="_blank" rel="noopener noreferrer nofollow">la web</a></p>'
    );
    expect(r.texto).toBe('Brief\nHola @María, revisa esto\n- Logo\n- Paleta\nVer la web');
    expect(r.menciones).toEqual(['u1']);
  });

  it('escapa el texto: <script> y comillas salen como texto', () => {
    const r = procesarDocumento(doc(p(t('<script>alert(1)</script> "hola" & \'chau\''))));
    expect(r.html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt; &quot;hola&quot; &amp; &#39;chau&#39;</p>');
  });

  it('enlaces javascript:, data: y vbscript: se descartan; el texto queda', () => {
    for (const href of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:msgbox', 'relativo/sin/esquema']) {
      const r = procesarDocumento(doc(p(t('clic', [{ type: 'link', attrs: { href } }]))));
      expect({ href, html: r.html }).toEqual({ href, html: '<p>clic</p>' });
    }
  });

  it('el href de un enlace válido va escapado (no puede cerrar el atributo)', () => {
    const r = procesarDocumento(doc(p(t('x', [{ type: 'link', attrs: { href: 'https://a.com/"onmouseover="alert(1)' } }]))));
    expect(r.html).not.toContain('"onmouseover');
    expect(r.html).toContain('href="https://a.com/%22onmouseover=%22alert(1)"');
  });

  it('la etiqueta de una mención va escapada', () => {
    const r = procesarDocumento(doc(p({ type: 'mention', attrs: { id: 'u"1', label: '<img src=x onerror=alert(1)>' } })));
    expect(r.html).toBe('<p><span class="mencion" data-id="u&quot;1">@&lt;img src=x onerror=alert(1)&gt;</span></p>');
  });

  it('rechaza tipos de nodo y formatos desconocidos (iframe, imagen, estilos)', () => {
    expect(() => procesarDocumento(doc({ type: 'iframe', attrs: { src: 'https://x' } }))).toThrow(/no se admite/);
    expect(() => procesarDocumento(doc({ type: 'image', attrs: { src: 'x', onerror: 'alert(1)' } }))).toThrow(/no se admite/);
    expect(() => procesarDocumento(doc(p(t('x', [{ type: 'textStyle', attrs: { color: 'red' } }]))))).toThrow(/no se admite/);
    expect(() => procesarDocumento({ type: 'paragraph' })).toThrow(/documento/);
    expect(() => procesarDocumento('<p>hola</p>')).toThrow();
  });

  it('ignora atributos inventados en nodos válidos', () => {
    const r = procesarDocumento(doc({ type: 'paragraph', attrs: { onclick: 'alert(1)', class: 'x' }, content: [t('hola')] }));
    expect(r.html).toBe('<p>hola</p>');
    expect(r.json).toEqual(doc(p(t('hola'))));
  });

  it('corta documentos demasiado anidados o enormes', () => {
    let anidado: Nodo = p(t('x'));
    for (let i = 0; i < 30; i++) anidado = { type: 'blockquote', content: [anidado] };
    expect(() => procesarDocumento(doc(anidado))).toThrow(/anidado/);
    const muchos = Array.from({ length: 6000 }, () => p(t('x')));
    expect(() => procesarDocumento(doc(...muchos))).toThrow(/largo/);
  });

  it('menciones sin repetir y en orden', () => {
    const m = (id: string) => ({ type: 'mention', attrs: { id, label: id } });
    expect(procesarDocumento(doc(p(m('b'), m('a'), m('b')))).menciones).toEqual(['b', 'a']);
  });

  it('niveles de título y listas numeradas se normalizan', () => {
    const r = procesarDocumento(
      doc({ type: 'heading', attrs: { level: 1 }, content: [t('T')] }, { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p(t('c'))] }] })
    );
    expect(r.html).toBe('<h2>T</h2><ol start="3"><li><p>c</p></li></ol>');
  });
});

describe('ayudas', () => {
  it('documentoDesdeTexto: párrafos y saltos de línea', () => {
    const r = procesarDocumento(documentoDesdeTexto('Hola\nmundo\n\nSegundo <b>'));
    expect(r.html).toBe('<p>Hola<br>mundo</p><p>Segundo &lt;b&gt;</p>');
    expect(r.texto).toBe('Hola\nmundo\nSegundo <b>');
  });

  it('enlaceSeguro', () => {
    expect(enlaceSeguro('https://a.com')).toBe('https://a.com/');
    expect(enlaceSeguro('mailto:a@b.pe')).toBe('mailto:a@b.pe');
    expect(enlaceSeguro('javascript:alert(1)')).toBeNull();
    expect(enlaceSeguro(42)).toBeNull();
  });
});
