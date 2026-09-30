const { test } = require('node:test');
const assert = require('node:assert/strict');

const { detect } = require('../../src/scripts/entryType.js');

const cases = {
    link:   ['https://a.com/x?y=1', 'www.example.org', '  http://a.co  '],
    email:  ['david@intelsa.co', 'a.b+c@mail.example.com'],
    number: ['42', '3.14', '1.234.567,89', '+57 300 123 4567', '$ 1,200', '(604) 555-1234', '15%'],
    code:   ['const x = 1;', 'arr.map(a => a * 2)', 'def foo(bar):\n    return bar', '<div class="a">', 'SELECT * FROM t'],
    text:   ['hola mundo', 'La reunión es el lunes.', 'visita https://a.com mañana', '', '   ', 'email me at a@b'],
};

for (const [key, samples] of Object.entries(cases)) {
    test(`detecta ${key}`, () => {
        for (const s of samples) assert.equal(detect(s).key, key, JSON.stringify(s));
    });
}

test('no string → text', () => {
    assert.equal(detect(undefined).key, 'text');
    assert.equal(detect(null).key, 'text');
});
