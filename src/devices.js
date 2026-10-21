// -----------------------------------------------------------------------------
// The Gladys device of a car park and its states:
//   free       counter-sensor/integer             spaces available
//   total      counter-sensor/integer             capacity
//   occupancy  level-sensor/liquid-level-percent  % of the spaces taken
//   open       input/binary                       1 = open (only for the
//                                                 sources that say it)
//   age        duration/integer (minutes)         age of the count
//
// Read-only, no polling: the integration reads the portals on its own timer
// (src/service.js), Gladys never polls (`should_poll: false`). The bounds are
// display bounds (gauges, charts), rounded up so that a capacity changed by
// a few spaces does not change the structure of the device.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { NAMES } from './messages.js';

export const PARKING_TYPE = 'parking';
export const MAX_DEVICE_NAME = 80;
export const MAX_AGE_MINUTES = 1440;

/** Shortens a text to `max` characters, with an ellipsis. */
export function clip(text, max) {
  const value = String(text ?? '');
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** A piece of an external id: letters, digits, "_" and "-" only. */
export const slug = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The platform id of a car park: "<source key>-<id given by the portal>". */
export const parkingPlatformId = (sourceKey, id) => `${sourceKey}-${slug(id)}`;

/** "Feydeau" from the operator's "FEYDEAU"; names already in mixed case stay. */
export function prettyName(name) {
  const small = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'sur', 'aux', 'au', 'en']);
  const value = String(name ?? '').trim();
  if (value !== value.toUpperCase() || !/\p{L}{2}/u.test(value)) {
    return value;
  }
  return value
    .toLowerCase()
    .split(/(\s+|-|'|’)/)
    .map((word, index, words) => {
      if (!/\p{L}/u.test(word)) {
        return word;
      }
      if ((word === 'd' || word === 'l') && /^['’]$/.test(words[index + 1] ?? '') && index > 0) {
        return word;
      }
      if (small.has(word) && index > 0) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join('');
}

/** Display bound of the counters: the capacity rounded up to the hundred. */
export const countMax = (total) => Math.max(100, Math.ceil((total ?? 0) / 100) * 100);

/** The feature keys of a car park of this source. */
export const featureKeys = (source) => [
  'free',
  'total',
  'occupancy',
  ...(source.hasOpen ? ['open'] : []),
  'age',
];

/** % of the spaces taken, or null without a count or a capacity. */
export function occupancy(reading) {
  if (reading.free === null || !reading.total) {
    return null;
  }
  const taken = ((reading.total - reading.free) / reading.total) * 100;
  return Math.min(100, Math.max(0, Math.round(taken)));
}

/**
 * The device of a car park.
 * @param {object} gladys
 * @param {string} sourceKey
 * @param {object} source an entry of SOURCES
 * @param {object} reading
 * @param {string} language
 */
export function buildParkingDevice(gladys, sourceKey, source, reading, language) {
  const ids = gladys.externalIds(PARKING_TYPE, parkingPlatformId(sourceKey, reading.id));
  const names = NAMES[language] ?? NAMES.en;
  const max = countMax(reading.total);
  const definitions = {
    free: { category: C.COUNTER_SENSOR, type: T.SENSOR.INTEGER, min: 0, max },
    total: { category: C.COUNTER_SENSOR, type: T.SENSOR.INTEGER, min: 0, max },
    occupancy: {
      category: C.LEVEL_SENSOR,
      type: T.LEVEL_SENSOR.LIQUID_LEVEL_PERCENT,
      unit: U.PERCENT,
      min: 0,
      max: 100,
    },
    open: { category: C.INPUT, type: T.SENSOR.BINARY, min: 0, max: 1 },
    age: {
      category: C.DURATION,
      type: T.DURATION.INTEGER,
      unit: U.MINUTES,
      min: 0,
      max: MAX_AGE_MINUTES,
    },
  };
  return {
    name: clip(`${source.name} · ${prettyName(reading.name)}`, MAX_DEVICE_NAME),
    external_id: ids.device,
    should_poll: false,
    params: [
      { name: 'source', value: sourceKey },
      { name: 'parking_id', value: reading.id },
    ],
    features: featureKeys(source).map((key) => ({
      name: names[key],
      external_id: ids.feature(key),
      ...definitions[key],
      read_only: true,
      has_feedback: false,
    })),
  };
}

/**
 * The states of a car park device. A value the portal does not give (no live
 * count, no capacity) is not published: the last known one stays. A closed
 * car park has 0 free spaces and is 100 % taken.
 * @param {number} ageMinutes
 */
export function parkingStates(gladys, sourceKey, source, reading, ageMinutes) {
  const ids = gladys.externalIds(PARKING_TYPE, parkingPlatformId(sourceKey, reading.id));
  // A closed car park has no space to offer, whatever its counter says
  // (Strasbourg and Bordeaux keep the last count of a closed one).
  const closed = reading.open === 0;
  const values = {
    free: closed ? 0 : reading.free,
    total: reading.total,
    occupancy: closed && reading.total ? 100 : occupancy(reading),
    open: reading.open,
    age: Math.min(MAX_AGE_MINUTES, Math.max(0, Math.floor(ageMinutes))),
  };
  return featureKeys(source)
    .filter((key) => values[key] !== null && values[key] !== undefined)
    .map((key) => ({ device_feature_external_id: ids.feature(key), state: values[key] }));
}
