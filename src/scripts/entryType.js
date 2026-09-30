/**
 * DwarfVault — Tipo de una entrada, deducido del texto (no se guarda).
 *
 * Se calcula al renderizar para que las entradas viejas también lo tengan
 * sin migrar IndexedDB. Orden importa: link > email > number > code > text.
 */
(function (root) {
    'use strict';

    const TYPES = {
        link:   { key: 'link',   icon: '🔗', label: 'Link'   },
        email:  { key: 'email',  icon: '✉️', label: 'Email'  },
        number: { key: 'number', icon: '#️⃣', label: 'Number' },
        code:   { key: 'code',   icon: '{}', label: 'Code'   },
        text:   { key: 'text',   icon: '📝', label: 'Text'   },
    };

    const LINK_RE   = /^(https?:\/\/|www\.)\S+$/i;
    const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const NUMBER_RE = /^[+\-]?[\d\s.,()$€£%+\-/]*\d[\d\s.,()$€£%+\-/]*$/;
    const CODE_RE   = /=>|[{};]\s*$|\b(function|const|let|var|def|class|import|return|SELECT|FROM)\b[\s(]|<\/?[a-z][\w-]*[^>]*>/m;

    /**
     * @param {string} text
     * @returns {{key:string, icon:string, label:string}}
     */
    function detect(text) {
        const t = typeof text === 'string' ? text.trim() : '';
        if (!t) return TYPES.text;
        if (LINK_RE.test(t))   return TYPES.link;
        if (EMAIL_RE.test(t))  return TYPES.email;
        if (NUMBER_RE.test(t)) return TYPES.number;
        if (CODE_RE.test(t))   return TYPES.code;
        return TYPES.text;
    }

    const DwarfEntryType = { detect, TYPES };

    root.DwarfEntryType = DwarfEntryType;
    if (typeof module !== 'undefined' && module.exports) module.exports = DwarfEntryType;
})(typeof self !== 'undefined' ? self : globalThis);
