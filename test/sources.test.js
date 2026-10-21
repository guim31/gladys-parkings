// -----------------------------------------------------------------------------
// The adapters of the seven portals, on their real answers of 2026-10-21:
// names, counts, capacities, open/closed states, dates, and the records
// without a live count.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getJson } from '../src/http.js';
import { SOURCES, int, time } from '../src/sources.js';
import { FIXTURE_TIME, createFetch, urlOf } from './helpers/world.js';

const read = async (key, network = createFetch()) => {
  const readings = await SOURCES[key].read(network.fetch, {}, FIXTURE_TIME);
  return new Map(readings.map((reading) => [reading.id, reading]));
};

test('Strasbourg: open, closed, and a car park without a live count', async () => {
  const parks = await read('strasbourg');
  assert.equal(parks.size, 35);
  assert.deepEqual(parks.get('10'), {
    id: '10',
    name: 'Parking Gare Wodli',
    free: 391,
    total: 955,
    open: 1,
    full: false,
    updatedAt: null,
    lat: 48.5873845279566,
    lon: 7.7367710015538,
  });
  // Zénith: closed (etat 2), its count is kept but it is never "full".
  const zenith = [...parks.values()].find((p) => p.name === 'Parking Zénith');
  assert.equal(zenith.open, 0);
  assert.equal(zenith.full, false);
  // etat 0: "fréquentation temps réel indisponible".
  const unknown = [...parks.values()].filter((p) => p.free === null);
  assert.equal(unknown.length, 2);
  assert.ok(unknown.every((p) => p.open === null));
});

test('Bordeaux: live car parks only, LIBRE / COMPLET / FERME, dates', async () => {
  const parks = await read('bordeaux');
  assert.equal(parks.size, 56);
  const states = [...parks.values()];
  assert.equal(states.filter((p) => p.open === 0).length, 3);
  const full = states.filter((p) => p.full);
  assert.equal(full.length, 1);
  assert.ok(states.every((p) => p.updatedAt > FIXTURE_TIME - 365 * 86400e3));
  const network = createFetch();
  await read('bordeaux', network);
  assert.match(network.calls[0].url, /where=connecte%3D1/);
});

test('Nantes: statuses 5 / 0, the operator threshold for "full", names in capitals', async () => {
  const parks = await read('nantes');
  assert.equal(parks.size, 27);
  const feydeau = parks.get('1');
  assert.equal(feydeau.name, 'FEYDEAU');
  assert.equal(feydeau.free, 171);
  assert.equal(feydeau.total, 490);
  assert.equal(feydeau.open, 1);
  assert.equal(feydeau.updatedAt, Date.parse('2026-10-21T14:34:40+00:00'));
  // Les Nefs: grp_statut 0, an invalid count.
  const nefs = [...parks.values()].find((p) => p.name === 'LES NEFS');
  assert.equal(nefs.free, null);
  assert.equal(nefs.total, null);
});

test('Nantes: under grp_complet the car park is full; subscribers only counts as closed', async () => {
  const network = createFetch();
  const url = urlOf('nantes.json');
  const document = structuredClone(network.routes[url]);
  document.results[0].grp_disponible = 8; // grp_complet is 10 for Feydeau
  document.results[1].grp_statut = 2;
  network.routes[url] = document;
  const parks = await read('nantes', network);
  assert.equal(parks.get('1').full, true);
  assert.equal(parks.get(String(document.results[1].grp_identifiant)).open, 0);
});

test('Rennes: Citédia car parks and STAR park-and-ride', async () => {
  const citedia = await read('rennes');
  assert.equal(citedia.size, 10);
  assert.deepEqual(
    { ...citedia.get('1503'), lat: undefined, lon: undefined },
    {
      id: '1503',
      name: 'Colombier',
      free: 519,
      total: 939,
      open: 1,
      full: false,
      updatedAt: null,
      lat: undefined,
      lon: undefined,
    },
  );
  const star = await read('rennes_star');
  assert.equal(star.size, 8);
  const viasilva = star.get('CVI');
  assert.equal(viasilva.name, 'Cesson-Viasilva');
  assert.equal(viasilva.total, 801);
  assert.equal(viasilva.open, 1);
  assert.ok(viasilva.updatedAt);
  assert.equal([...star.values()].filter((p) => p.full).length, 1);
});

test('Grenoble: names and capacities from the list, counts from the live document', async () => {
  const parks = await read('grenoble');
  assert.equal(parks.size, 71);
  const counted = [...parks.values()].filter((p) => p.free !== null);
  assert.equal(counted.length, 26);
  const estacade = [...parks.values()].find((p) => p.name === 'ESTACADE');
  assert.equal(estacade.total, 581);
  assert.equal(typeof estacade.free, 'number');
  assert.equal(estacade.open, null);
  assert.ok(estacade.updatedAt > FIXTURE_TIME - 3600e3);
});

test('Grenoble: the list is read once a day, the counts at every reading', async () => {
  const network = createFetch();
  const cache = {};
  await SOURCES.grenoble.read(network.fetch, cache, FIXTURE_TIME);
  await SOURCES.grenoble.read(network.fetch, cache, FIXTURE_TIME + 3600e3);
  assert.equal(network.calls.filter((c) => c.url.includes('findType')).length, 1);
  assert.equal(network.calls.filter((c) => c.url.includes('/dyn/')).length, 2);
  await SOURCES.grenoble.read(network.fetch, cache, FIXTURE_TIME + 25 * 3600e3);
  assert.equal(network.calls.filter((c) => c.url.includes('findType')).length, 2);
});

test('Poitiers: Data Fair lines, position as "lat, lon"', async () => {
  const parks = await read('poitiers');
  assert.equal(parks.size, 9);
  const theatre = parks.get('3');
  assert.equal(theatre.name, 'THEATRE');
  assert.equal(theatre.total, 320);
  assert.equal(theatre.open, null);
  assert.ok(Math.abs(theatre.lat - 46.5838) < 0.001);
  assert.ok(Math.abs(theatre.lon - 0.3378) < 0.001);
});

test('Opendatasoft: the next pages are read when the dataset holds more than 100 records', async () => {
  const records = Array.from({ length: 130 }, (_, i) => ({
    ident: i + 1,
    nom_parking: `P${i + 1}`,
    etat: 1,
    libre: 10,
    total: 20,
  }));
  const base =
    'https://data.strasbourg.eu/api/explore/v2.1/catalog/datasets/occupation-parkings-temps-reel/records';
  const network = createFetch({
    [`${base}?limit=100&offset=0`]: { total_count: 130, results: records.slice(0, 100) },
    [`${base}?limit=100&offset=100`]: { total_count: 130, results: records.slice(100) },
  });
  const parks = await read('strasbourg', network);
  assert.equal(parks.size, 130);
});

test('a portal error is an error with the host only', async () => {
  const network = createFetch({ [urlOf('rennes.json')]: 503 });
  await assert.rejects(read('rennes', network), /^Error: data\.rennesmetropole\.fr: HTTP 503$/);
  const broken = createFetch({ [urlOf('poitiers.json')]: () => new Response('<html>') });
  await assert.rejects(read('poitiers', broken), /invalid JSON/);
  await assert.rejects(getJson(createFetch().fetch, 'https://example.org/'), /HTTP 404/);
});

test('int and time helpers', () => {
  assert.equal(int('12'), 12);
  assert.equal(int(-3), 0);
  assert.equal(int(null), null);
  assert.equal(int('Fermé'), null);
  assert.equal(time('2026-10-21T14:29:00+00:00'), Date.parse('2026-10-21T14:29:00Z'));
  assert.equal(time(1792592940000), 1792592940000);
  assert.equal(time('n/a'), null);
});

test('Grenoble: a failing list read keeps the list already known', async () => {
  const network = createFetch();
  const cache = {};
  await SOURCES.grenoble.read(network.fetch, cache, FIXTURE_TIME);
  network.routes[urlOf('grenoble-list.json')] = 503;
  const readings = await SOURCES.grenoble.read(network.fetch, cache, FIXTURE_TIME + 25 * 3600e3);
  assert.equal(readings.length, 71);
});

test('a blank position is no position', async () => {
  const network = createFetch();
  const url = urlOf('poitiers.json');
  const document = structuredClone(network.routes[url]);
  document.results[0]._geopoint = '';
  network.routes[url] = document;
  const parks = await read('poitiers', network);
  assert.equal(parks.get(String(document.results[0].Id)).lat, null);
});
