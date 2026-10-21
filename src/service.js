// -----------------------------------------------------------------------------
// The integration at runtime: the cities read, their last readings, the
// refresh timer, the devices offered in the Discover tab, the states of the
// car parks added to Gladys, and the scene triggers.
//
// Data flow: every city ticked in the configuration, plus every city with a
// car park added to Gladys, is read at the configured pace (one request per
// city, two for Grenoble). Every car park of the ticked cities with a live
// count is offered in the Discover tab; the ones the user adds are the
// "watched" car parks: states, widget, triggers and scene action.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { DEFAULT_CONFIG, normalizeConfig } from './config.js';
import {
  PARKING_TYPE,
  buildParkingDevice,
  occupancy,
  parkingPlatformId,
  parkingStates,
  prettyName,
} from './devices.js';
import { REPORTS, TEXT, lines, render, say } from './messages.js';
import { SOURCES, SOURCE_KEYS } from './sources.js';

const logger = createLogger({ name: 'parkings' });

// A count older than this is "out of date": shown grey, never offered by the
// scene action, never compared by the triggers.
export const STALE_MS = 30 * 60 * 1000;
// Unchanged states (a car park always full) are sent again this often, or the
// dashboard shows "no recent value" after 48 hours.
export const HEARTBEAT_MS = 6 * 3600 * 1000;

export const TRIGGERS = {
  FREE_LOW: 'free_low',
  FREE_BACK: 'free_back',
  FULL: 'full',
  CLOSED: 'closed',
};
// The thresholds offered by the free spaces triggers (the scene filters only
// compare for equality: an event is fired for every threshold crossed).
export const THRESHOLDS = [5, 10, 20, 50, 100];

/** One city at runtime: its source, its last readings and how they went. */
class City {
  constructor(key) {
    this.key = key;
    this.source = SOURCES[key];
    this.readings = null; // Map id → reading
    this.okAt = null;
    this.previousOkAt = null;
    this.error = null;
    this.cache = {};
  }
}

export class Parkings {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake)
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {boolean} [options.timers] false in the tests: they call refresh()
   */
  constructor({ gladys, fetch = globalThis.fetch, now = Date.now, timers = true }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.now = now;
    this.useTimers = timers;
    this.config = normalizeConfig(DEFAULT_CONFIG);
    this.cities = new Map(); // key → City
    this.discoveredSignature = null;
    this.publishFailed = false;
    this.discoveryFailed = false;
    this.fireFailed = false;
    this.timer = null;
    this.stopped = false;
    this.refreshing = null;
    this.loading = Promise.resolve();
  }

  // --- lifecycle --------------------------------------------------------------

  async start(config) {
    this.config = config;
    this.schedule();
    logger.info(
      `Started: ${config.cities.length} city(ies) chosen, ${this.watched().length} car park(s) added`,
    );
    // The first reading in the background: the widget and the scene action
    // say so meanwhile.
    this.loading = this.refresh({ discover: true });
  }

  /** Gladys restarted: everything again, the states included. */
  async resync(config) {
    this.config = config;
    this.gladys.forgetPublishedStates?.();
    await this.refresh({ discover: true });
  }

  async reconfigure(config) {
    this.config = config;
    this.schedule();
    await this.refresh({ discover: true });
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.refreshing;
  }

  schedule() {
    if (!this.useTimers || this.stopped) {
      return;
    }
    clearTimeout(this.timer);
    // A callback still running when the schedule changes must not start a
    // second chain: each chain only continues while it is the current one.
    this.generation = (this.generation ?? 0) + 1;
    const generation = this.generation;
    const tick = () => {
      this.timer = setTimeout(async () => {
        await this.refresh();
        if (!this.stopped && this.generation === generation) {
          tick();
        }
      }, this.config.refreshSeconds * 1000);
      this.timer.unref?.();
    };
    tick();
  }

  // --- devices ----------------------------------------------------------------

  deviceId(key, id) {
    return this.gladys.externalIds(PARKING_TYPE, parkingPlatformId(key, id)).device;
  }

  /** The source key of a device created in Gladys, from its params or its external id. */
  sourceOfDevice(device) {
    const param = device?.params?.find?.((p) => p.name === 'source')?.value;
    if (SOURCE_KEYS.includes(param)) {
      return param;
    }
    const id = String(device?.external_id ?? '');
    return SOURCE_KEYS.find((key) => id.includes(`:${key}-`)) ?? null;
  }

  /** The car parks added to Gladys: `{ deviceId, key, name }[]`. */
  watched() {
    return (this.gladys.devices ?? [])
      .map((device) => ({
        deviceId: device.external_id,
        key: this.sourceOfDevice(device),
        name: device.name,
      }))
      .filter((entry) => entry.key);
  }

  /** The cities to read: the ones ticked, and the ones of the car parks added. */
  activeKeys() {
    const keys = new Set([...this.config.cities, ...this.watched().map((entry) => entry.key)]);
    return SOURCE_KEYS.filter((key) => keys.has(key));
  }

  city(key) {
    if (!this.cities.has(key)) {
      this.cities.set(key, new City(key));
    }
    return this.cities.get(key);
  }

  /** The last reading of a device's car park: `{ city, reading }`, reading null if unknown. */
  lookup(deviceId) {
    for (const city of this.cities.values()) {
      for (const reading of city.readings?.values() ?? []) {
        if (this.deviceId(city.key, reading.id) === deviceId) {
          return { city, reading };
        }
      }
    }
    const entry = this.watched().find((w) => w.deviceId === deviceId);
    return entry ? { city: this.city(entry.key), reading: null } : null;
  }

  /** Age of a count in ms: from the portal's date, else from the last read. */
  ageMs(city, reading) {
    const at = reading.updatedAt ?? city.okAt;
    return at === null ? Infinity : Math.max(0, this.now() - at);
  }

  isStale(city, reading) {
    return this.ageMs(city, reading) > STALE_MS;
  }

  /** "Strasbourg · Parking Gare Wodli" when several cities are read, else the name alone. */
  label(city, reading) {
    const name = prettyName(reading.name);
    return this.activeKeys().length > 1 ? `${city.source.name} · ${name}` : name;
  }

  async publishDiscovered({ force = false } = {}) {
    const created = new Set(this.watched().map((entry) => entry.deviceId));
    const devices = [];
    for (const key of this.config.cities) {
      const city = this.cities.get(key);
      for (const reading of city?.readings?.values() ?? []) {
        // A car park without a live count (no sensor) is not worth a device.
        if (reading.free !== null || created.has(this.deviceId(key, reading.id))) {
          devices.push(
            buildParkingDevice(this.gladys, key, city.source, reading, this.config.language),
          );
        }
      }
    }
    const signature = JSON.stringify(devices.map((d) => [d.external_id, d.name, d.features]));
    if (!force && signature === this.discoveredSignature) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discoveredSignature = signature;
      if (this.discoveryFailed) {
        this.discoveryFailed = false;
        logger.info('Discovered car parks published again');
      }
    } catch (err) {
      if (!this.discoveryFailed) {
        logger.warn(`Cannot publish the discovered car parks: ${err.message}`);
      }
      this.discoveryFailed = true;
    }
  }

  async publish(states) {
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      if (this.publishFailed) {
        this.publishFailed = false;
        logger.info('States published again');
      }
    } catch (err) {
      // Gladys restarting: said once, the next refresh sends them again.
      if (!this.publishFailed) {
        logger.warn(`Cannot publish ${states.length} state(s): ${err.message}`);
      }
      this.publishFailed = true;
    }
  }

  statesOf(city, reading) {
    return parkingStates(
      this.gladys,
      city.key,
      city.source,
      reading,
      this.ageMs(city, reading) / 60000,
    );
  }

  /** A device was just added in Gladys: its states, all of them, now. */
  async onDeviceCreated(device) {
    const found = this.lookup(device?.external_id);
    if (!found?.reading) {
      return;
    }
    await this.publish(this.statesOf(found.city, found.reading));
    this.gladys.requestWidgetRefresh?.('parkings')?.catch?.(() => {});
  }

  // --- refresh ------------------------------------------------------------------

  /** One read of every active city; concurrent calls share it. */
  refresh({ discover = false } = {}) {
    if (!this.refreshing) {
      this.refreshing = this.refreshAll(discover)
        .catch((err) => logger.warn(`Refresh failed: ${err.message}`))
        .finally(() => {
          this.refreshing = null;
        });
      return this.refreshing;
    }
    // A forced discovery asked during a refresh runs right after it.
    return discover
      ? this.refreshing.then(() => this.publishDiscovered({ force: true }))
      : this.refreshing;
  }

  async refreshAll(forceDiscovery) {
    const events = [];
    const fresh = new Set();
    for (const key of this.activeKeys()) {
      const city = this.city(key);
      const previous = city.readings;
      if (await this.readCity(city)) {
        fresh.add(key);
        events.push(...this.cityEvents(city, previous));
      }
    }
    await this.publishDiscovered({ force: forceDiscovery });
    // States of every car park added, even when its city could not be read:
    // its age keeps growing.
    const states = [];
    for (const entry of this.watched()) {
      const found = this.lookup(entry.deviceId);
      if (found?.reading) {
        states.push(...this.statesOf(found.city, found.reading));
      }
    }
    await this.publish(states);
    for (const { key, data } of events) {
      await this.fire(key, data);
    }
  }

  /** Reads a city; a failure is logged once, until it works again. */
  async readCity(city) {
    try {
      const readings = await city.source.read(this.fetch, city.cache, this.now());
      city.readings = new Map(readings.map((reading) => [reading.id, reading]));
      city.previousOkAt = city.okAt;
      city.okAt = this.now();
      if (city.error) {
        logger.info(`${city.source.name}: data back`);
      }
      city.error = null;
      logger.debug(`${city.source.name}: ${readings.length} car parks read`);
      return true;
    } catch (err) {
      if (!city.error) {
        logger.warn(`${city.source.name}: data unavailable: ${err.message}`);
      }
      city.error = err.message;
      return false;
    }
  }

  /** The trigger events between the previous and the new readings of a city. */
  cityEvents(city, previous) {
    // A comparison with a reading hours old (a portal back after an outage)
    // would fire crossings that are no longer news.
    const recent =
      previous &&
      city.previousOkAt !== null &&
      city.okAt - city.previousOkAt <= 2 * this.config.refreshSeconds * 1000 + 5000;
    if (!recent) {
      return [];
    }
    const created = new Set(this.watched().map((entry) => entry.deviceId));
    const events = [];
    for (const after of city.readings.values()) {
      const deviceId = this.deviceId(city.key, after.id);
      const before = previous.get(after.id);
      // Only a created device can be picked by a scene; an out of date count
      // is not news either.
      if (!before || !created.has(deviceId) || this.isStale(city, after)) {
        continue;
      }
      events.push(...this.parkingEvents(city, deviceId, before, after));
    }
    return events;
  }

  /** The events of one car park between two readings. */
  parkingEvents(city, deviceId, before, after) {
    const events = [];
    const data = {
      parking: deviceId,
      parking_name: prettyName(after.name),
      city: city.source.name,
      free: after.free ?? 0,
      total: after.total ?? 0,
      occupancy: occupancy(after) ?? 0,
    };
    if (before.open === 1 && after.open === 0) {
      events.push({ key: TRIGGERS.CLOSED, data });
    }
    const counted = (r) => r.free !== null && r.open !== 0;
    if (!counted(before) || !counted(after)) {
      return events;
    }
    for (const threshold of THRESHOLDS) {
      if (before.free > threshold && after.free <= threshold) {
        events.push({ key: TRIGGERS.FREE_LOW, data: { ...data, threshold: String(threshold) } });
      } else if (before.free <= threshold && after.free > threshold) {
        events.push({ key: TRIGGERS.FREE_BACK, data: { ...data, threshold: String(threshold) } });
      }
    }
    if (!before.full && after.full) {
      events.push({ key: TRIGGERS.FULL, data });
    }
    return events;
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      if (this.fireFailed) {
        this.fireFailed = false;
        logger.info('Scene triggers fired again');
      }
    } catch (err) {
      if (!this.fireFailed) {
        logger.warn(`Cannot fire the ${key} trigger: ${err.message}`);
      }
      this.fireFailed = true;
    }
  }

  // --- texts ------------------------------------------------------------------

  /** "391 / 955 libres", "fermé", "donnée périmée"… for a widget row (40 characters). */
  shortText(city, reading, language) {
    if (!reading) {
      return '—';
    }
    if (reading.open === 0) {
      return say(TEXT, language, 'closed');
    }
    if (reading.free === null) {
      return say(TEXT, language, 'unknown');
    }
    if (this.isStale(city, reading)) {
      return say(TEXT, language, 'stale');
    }
    return say(TEXT, language, 'counts', reading);
  }

  // --- configuration action -----------------------------------------------------

  status() {
    const now = this.now();
    const blocks = [];
    if (this.config.cities.length === 0) {
      blocks.push(render(REPORTS, 'noCity'));
    }
    for (const key of this.activeKeys()) {
      const city = this.city(key);
      const counted = [...(city.readings?.values() ?? [])].filter((r) => r.free !== null);
      blocks.push(
        render(REPORTS, 'city', { name: city.source.name, count: counted.length }),
        city.okAt === null
          ? render(REPORTS, 'waiting')
          : render(REPORTS, 'read', { age: Math.round((now - city.okAt) / 1000) }),
        city.error ? render(REPORTS, 'error', { error: city.error }) : null,
      );
    }
    blocks.push(render(REPORTS, 'watched', { count: this.watched().length }));
    return lines(...blocks);
  }
}
