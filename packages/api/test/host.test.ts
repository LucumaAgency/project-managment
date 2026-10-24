import { describe, expect, it } from 'vitest';
import { destinoDesdeHost } from '../src/lib/host.js';

describe('destinoDesdeHost', () => {
  const casos: [string | undefined, ReturnType<typeof destinoDesdeHost>][] = [
    ['lucuma.app.com', { tipo: 'cuenta', slug: 'lucuma' }],
    ['Lucuma.App.com:443', { tipo: 'cuenta', slug: 'lucuma' }],
    ['lucuma.app.com.', { tipo: 'cuenta', slug: 'lucuma' }],
    ['app.com', { tipo: 'raiz' }],
    ['www.app.com', { tipo: 'raiz' }],
    ['api.app.com', { tipo: 'raiz' }],
    ['a.b.app.com', { tipo: 'ajeno' }],
    ['malapp.com', { tipo: 'ajeno' }], // termina en "app.com" pero no es subdominio
    ['otro.com', { tipo: 'ajeno' }],
    ['', { tipo: 'ajeno' }],
    [undefined, { tipo: 'ajeno' }],
  ];
  it.each(casos)('%s', (host, esperado) => {
    expect(destinoDesdeHost(host, 'app.com')).toEqual(esperado);
  });

  it('sin dominio base no hay cuenta por host', () => {
    expect(destinoDesdeHost('lucuma.app.com', '')).toEqual({ tipo: 'ajeno' });
  });
});
