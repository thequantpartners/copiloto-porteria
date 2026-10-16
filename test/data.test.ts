import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadAuthorizations, loadBuildings, loadDocChunks } from '../src/data.ts';

test('carga los edificios y las autorizaciones', () => {
  assert.ok(loadBuildings().length >= 3);
  const auth = loadAuthorizations();
  assert.ok(auth.length >= 5);
  assert.ok(auth.every((a) => a.edificio_id && a.valido_desde && a.valido_hasta));
});

test('corta cada documento por sección y conserva su encabezado', () => {
  const chunks = loadDocChunks();
  assert.ok(chunks.length > 20);
  const delivery = chunks.find((c) => c.doc_id === 'PROC-OP-001-v2' && c.section === '2. Delivery');
  assert.ok(delivery);
  assert.equal(delivery.meta.estado, 'VIGENTE');
});
