// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and the real
// answers of the portals: discovery, states, age and out-of-date counts,
// triggers, widget, scene action, the integration's own timer.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_COLORS, validateWidgetContent } from '@gladysassistant/integration-sdk';
import { registerHandlers } from '../src/app.js';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { STALE_MS, TRIGGERS } from '../src/service.js';
import {
  action,
  create,
  createFetch,
  createWorld,
  cycle,
  discovered,
  featureId,
  setRecords,
  urlOf,
} from './helpers/world.js';

const FEYDEAU = (r) => r.grp_nom === 'FEYDEAU';

test('the car parks of the cities ticked are offered, the others are not read', async (t) => {
  const world = await createWorld({ config: { cities: ['nantes'] } });
  t.after(() => world.app.stop());
  assert.equal(world.fake.discoveredDevices.length, 26);
  const feydeau = discovered(world, 'Feydeau');
  assert.equal(feydeau.name, 'Nantes Métropole · Feydeau');
  assert.equal(feydeau.should_poll, false);
  assert.equal(feydeau.poll_frequency, undefined);
  assert.ok(world.network.calls.every((call) => call.url.includes('nantesmetropole')));
});

test('no city ticked: nothing read, an empty discovery, the status says what to do', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.discoveredDevices, []);
  assert.equal(world.network.calls.length, 0);
  const message = await action(world, 'status');
  assert.match(message.fr, /Aucune ville choisie/);
});

test('a device added gets all its states at once, then only the changes', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = await create(world, 'Feydeau');
  const last = (key) => world.fake.lastState(featureId(device, key));
  assert.equal(last('free'), 171);
  assert.equal(last('total'), 490);
  assert.equal(last('occupancy'), 65);
  assert.equal(last('open'), 1);
  assert.equal(last('age'), 2); // 14:34:40 → 14:36:46
  assert.deepEqual(world.fake.widgetRefreshes, ['parkings']);

  const before = world.fake.states.length;
  setRecords(world, 'nantes.json', FEYDEAU, { grp_disponible: 160 });
  await cycle(world, 180);
  const sent = world.fake.states.slice(before).map((s) => s.device_feature_external_id);
  // free and occupancy changed, and the age grew; total and open did not.
  assert.deepEqual(
    sent.sort(),
    ['age', 'free', 'occupancy'].map((k) => featureId(device, k)).sort(),
  );
  assert.equal(last('free'), 160);
  assert.equal(last('age'), 5);
});

test('a portal down: the age keeps growing, the count is out of date after 30 minutes', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = await create(world, 'Feydeau');
  world.network.routes[urlOf('nantes.json')] = new TypeError('fetch failed');
  for (let i = 0; i < 11; i += 1) {
    await cycle(world, 180);
  }
  assert.equal(world.fake.lastState(featureId(device, 'age')), 35);
  assert.equal(world.fake.lastState(featureId(device, 'free')), 171);
  const { data } = await world.fake.widgetGet('parkings', { language: 'fr' });
  assert.deepEqual(data.content.components[0].items[0], {
    label: 'Feydeau',
    value: 'donnée périmée',
    color: WIDGET_COLORS.NEUTRAL,
  });
  const best = await world.fake.sceneAction('find_best', {});
  assert.equal(best.data.outputs.found, 0);
  const status = await action(world, 'status');
  assert.match(status.en, /Last error: data\.nantesmetropole\.fr: fetch failed/);
});

test('free spaces triggers: one event per threshold crossed, down then back up', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = await create(world, 'Feydeau');
  setRecords(world, 'nantes.json', FEYDEAU, { grp_disponible: 15 });
  await cycle(world);
  const down = world.fake.sceneEvents.map((e) => [e.key, e.data.threshold]);
  assert.deepEqual(down, [
    [TRIGGERS.FREE_LOW, '20'],
    [TRIGGERS.FREE_LOW, '50'],
    [TRIGGERS.FREE_LOW, '100'],
  ]);
  assert.deepEqual(world.fake.sceneEvents[0].data, {
    parking: device.external_id,
    parking_name: 'Feydeau',
    city: 'Nantes Métropole',
    free: 15,
    total: 490,
    occupancy: 97,
    threshold: '20',
  });
  setRecords(world, 'nantes.json', FEYDEAU, { grp_disponible: 60 });
  await cycle(world);
  const up = world.fake.sceneEvents.slice(3).map((e) => [e.key, e.data.threshold]);
  assert.deepEqual(up, [
    [TRIGGERS.FREE_BACK, '20'],
    [TRIGGERS.FREE_BACK, '50'],
  ]);
  // Same value again: nothing.
  await cycle(world);
  assert.equal(world.fake.sceneEvents.length, 5);
});

test('full and closed triggers, only for the car parks added', async (t) => {
  const world = await createWorld({ config: { cities: ['bordeaux'] } });
  t.after(() => world.app.stop());
  const device = await create(world, 'Grand Parc');
  setRecords(world, 'bordeaux.json', () => true, { etat: 'COMPLET', libres: 0 });
  await cycle(world);
  const full = world.fake.sceneEvents.filter((e) => e.key === TRIGGERS.FULL);
  assert.equal(full.length, 1);
  assert.equal(full[0].data.parking, device.external_id);
  setRecords(world, 'bordeaux.json', () => true, { etat: 'FERME' });
  await cycle(world);
  const closed = world.fake.sceneEvents.filter((e) => e.key === TRIGGERS.CLOSED);
  assert.equal(closed.length, 1);
  assert.equal(world.fake.lastState(featureId(device, 'open')), 0);
});

test('no trigger after an outage: the change is no longer news', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await create(world, 'Feydeau');
  const url = urlOf('nantes.json');
  const saved = world.network.routes[url];
  world.network.routes[url] = 503;
  await cycle(world);
  await cycle(world);
  await cycle(world);
  world.network.routes[url] = saved;
  setRecords(world, 'nantes.json', FEYDEAU, { grp_disponible: 0 });
  await cycle(world);
  assert.deepEqual(world.fake.sceneEvents, []);
});

test('the widget: one colored row per car park, in the language asked', async (t) => {
  const world = await createWorld({ config: { cities: ['nantes', 'strasbourg'] } });
  t.after(() => world.app.stop());
  await create(world, 'Feydeau'); // 65 %
  await create(world, 'Zénith'); // closed
  const wodli = await create(world, 'Gare Wodli');
  setRecords(world, 'nantes.json', FEYDEAU, { grp_disponible: 20 });
  await cycle(world);
  const { data } = await world.fake.widgetGet('parkings', { language: 'en' });
  assert.deepEqual(validateWidgetContent(data.content), []);
  assert.deepEqual(data.content.components[0].items, [
    { label: 'Nantes Métropole · Feydeau', value: '20 / 490 free', color: WIDGET_COLORS.DANGER },
    { label: 'Strasbourg · Parking Zénith', value: 'closed', color: WIDGET_COLORS.NEUTRAL },
    {
      label: 'Strasbourg · Parking Gare Wodli',
      value: '391 / 955 free',
      color: WIDGET_COLORS.SUCCESS,
    },
  ]);
  const one = await world.fake.widgetGet('parkings', {
    language: 'de',
    settings: { parkings: [wodli.external_id] },
  });
  assert.equal(one.data.content.components[0].items.length, 1);
  assert.equal(one.data.content.components[0].items[0].value, '391 / 955 frei');
});

test('the widget without a car park added says how to add one', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const { data } = await world.fake.widgetGet('parkings', { language: 'es' });
  assert.match(data.content.components[0].text, /Descubrir/);
});

test('find_best: the open car park with the most free spaces, among those picked', async (t) => {
  const world = await createWorld({ config: { cities: ['strasbourg'] } });
  t.after(() => world.app.stop());
  const wodli = await create(world, 'Gare Wodli'); // 391
  const zenith = await create(world, 'Zénith'); // closed, 2976 counted
  await create(world, 'Coubertin'); // 551
  const all = await world.fake.sceneAction('find_best', {});
  assert.deepEqual(all.data.outputs, {
    found: 1,
    sentence: 'Parking Coubertin : 551 places libres sur 719.',
    parking_name: 'Parking Coubertin',
    city: 'Strasbourg',
    free: 551,
    total: 719,
    occupancy: 23,
  });
  const picked = await world.fake.sceneAction('find_best', {
    parkings: [wodli.external_id, zenith.external_id],
  });
  assert.equal(picked.data.outputs.parking_name, 'Parking Gare Wodli');
  const closed = await world.fake.sceneAction('find_best', { parkings: [zenith.external_id] });
  assert.equal(closed.data.outputs.found, 0);
  assert.match(closed.data.outputs.sentence, /Aucun parking suivi/);
});

test('find_best without any car park added is an error', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const result = await world.fake.sceneAction('find_best', {});
  assert.equal(result.success, false);
});

test('a car park added stays read when its city is unticked', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = await create(world, 'Feydeau');
  await world.fake.configUpdated({ cities: [] });
  assert.deepEqual(world.fake.discoveredDevices, []);
  setRecords(world, 'nantes.json', FEYDEAU, { grp_disponible: 99 });
  await cycle(world);
  assert.equal(world.fake.lastState(featureId(device, 'free')), 99);
});

test('a restart with car parks already added publishes their states', async (t) => {
  const first = await createWorld();
  const device = await create(first, 'Feydeau');
  await first.app.stop();
  const world = await createWorld({ devices: [device] });
  t.after(() => world.app.stop());
  assert.equal(world.fake.lastState(featureId(device, 'free')), 171);
});

test('the integration reads on its own timer, without any poll from Gladys', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const network = createFetch();
  const gladys = createFakeGladys({ config: { cities: ['nantes'], refresh_interval: '120' } });
  const app = registerHandlers(gladys, { fetch: network.fetch });
  t.after(() => app.stop());
  await gladys.connect();
  await app.ready;
  await app.service.loading;
  const reads = () => network.calls.filter((c) => c.url.includes('nantesmetropole')).length;
  assert.equal(reads(), 1);
  t.mock.timers.tick(120 * 1000);
  await app.service.refreshing;
  assert.equal(reads(), 2);
  t.mock.timers.tick(120 * 1000);
  await app.service.refreshing;
  assert.equal(reads(), 3);
});

test('a count dated in the portal more than 30 minutes ago is out of date', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = await create(world, 'Feydeau');
  const old = new Date(world.clock.now() - STALE_MS - 60000).toISOString();
  setRecords(world, 'nantes.json', FEYDEAU, { grp_horodatage: old, grp_disponible: 3 });
  await cycle(world, 1);
  assert.equal(world.fake.lastState(featureId(device, 'age')), 31);
  // Old news: no trigger.
  assert.deepEqual(world.fake.sceneEvents, []);
});

test('review fixes: a reopening fires "free spaces back", a closed car park has 0 free', async (t) => {
  const world = await createWorld({ config: { cities: ['bordeaux'] } });
  t.after(() => world.app.stop());
  const device = await create(world, 'Grand Parc');
  setRecords(world, 'bordeaux.json', (r) => r.nom === 'Grand Parc', { etat: 'FERME' });
  await cycle(world);
  assert.deepEqual(
    world.fake.sceneEvents.map((e) => e.key),
    [TRIGGERS.CLOSED],
  );
  assert.equal(world.fake.lastState(featureId(device, 'free')), 0);
  assert.equal(world.fake.lastState(featureId(device, 'occupancy')), 100);
  setRecords(world, 'bordeaux.json', (r) => r.nom === 'Grand Parc', { etat: 'LIBRE' });
  await cycle(world);
  const back = world.fake.sceneEvents.slice(1);
  assert.ok(back.length > 0 && back.every((e) => e.key === TRIGGERS.FREE_BACK));
});

test('review fixes: no trigger when the previous count was already out of date', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await create(world, 'Feydeau');
  const old = new Date(world.clock.now() - STALE_MS - 60000).toISOString();
  setRecords(world, 'nantes.json', FEYDEAU, { grp_horodatage: old });
  await cycle(world);
  setRecords(world, 'nantes.json', FEYDEAU, {
    grp_horodatage: new Date(world.clock.now()).toISOString(),
    grp_disponible: 3,
  });
  await cycle(world);
  assert.deepEqual(world.fake.sceneEvents, []);
});

test('review fixes: a city ticked while a reading runs is read right after it', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const url = urlOf('nantes.json');
  const saved = world.network.routes[url];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  world.network.routes[url] = async () => {
    await gate;
    return saved;
  };
  const running = world.service.refresh();
  const reconfigured = world.fake.configUpdated({ cities: ['nantes', 'poitiers'] });
  release();
  await running;
  await reconfigured;
  assert.ok(world.fake.discoveredDevices.some((d) => d.name.startsWith('Grand Poitiers')));
});
