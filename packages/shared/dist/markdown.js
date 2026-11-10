/**
 * Documentos en Markdown (D-82). Una sola configuración para el servidor (arma el HTML que se
 * guarda) y la web (vista previa mientras se escribe), así lo que se ve al escribir es lo que
 * queda. Entrada aparte (`@lucuma-pm/shared/markdown`) para no sumar la librería a todo lo demás.
 *
 * Seguridad: `html: false` escapa cualquier HTML escrito a mano (no hay <script>, <iframe> ni
 * atributos), y markdown-it ya rechaza enlaces javascript:, vbscript:, file: y data: (salvo
 * imágenes data:image). Encima de eso, aquí solo se aceptan enlaces http, https y mailto, y las
 * imágenes solo por https. Los enlaces se abren en otra pestaña sin pasar quién los abrió.
 */
import MarkdownIt from 'markdown-it';
/** Tope del texto de un documento: unas 50 páginas. */
export const MAX_DOCUMENTO = 200_000;
const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false });
const ENLACE_OK = /^(https?:|mailto:)/i;
const IMAGEN_OK = /^https:/i;
md.validateLink = (url) => {
    const u = url.trim();
    // Anclas internas (#seccion) y rutas relativas no llevan a ningún lado útil: se rechazan igual.
    return ENLACE_OK.test(u);
};
const enlaceAbre = md.renderer.rules.link_open ?? ((tokens, i, opts, _env, self) => self.renderToken(tokens, i, opts));
md.renderer.rules.link_open = (tokens, i, opts, env, self) => {
    tokens[i].attrSet('target', '_blank');
    tokens[i].attrSet('rel', 'noopener noreferrer nofollow');
    return enlaceAbre(tokens, i, opts, env, self);
};
const imagen = md.renderer.rules.image;
md.renderer.rules.image = (tokens, i, opts, env, self) => {
    const src = tokens[i].attrGet('src') ?? '';
    // Solo https: una imagen http rompe el candado y una data: puede pesar megas dentro del texto.
    if (!IMAGEN_OK.test(src))
        return md.utils.escapeHtml(tokens[i].content || 'imagen');
    tokens[i].attrSet('loading', 'lazy');
    tokens[i].attrSet('referrerpolicy', 'no-referrer');
    return imagen(tokens, i, opts, env, self);
};
/** HTML listo para mostrar a partir del Markdown. */
export function markdownAHtml(texto) {
    return md.render(texto);
}
