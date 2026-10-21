// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// - find_best: among the watched car parks (all of them, or the ones picked),
//   the open one with the most free spaces, as numbers for a "Continue only
//   if" step and as a sentence ready for a message or a speaker
//   ("Parking Gare Wodli : 391 places libres sur 955.").
//
// A scene action does not receive the user's language: the sentence follows
// the `language` of the configuration. Outputs are numbers, never booleans:
// the core's "Continue only if" compares with ===. A car park closed, without
// a live count or with a count out of date is never chosen.
// -----------------------------------------------------------------------------

import { occupancy, prettyName } from './devices.js';
import { TEXT, say } from './messages.js';

export class SceneError extends Error {}

const chosenIds = (value) =>
  (Array.isArray(value) ? value : value ? [value] : []).map(String).filter(Boolean);

export const SCENE_ACTIONS = {
  async find_best(service, { fields }) {
    const language = service.config.language;
    // Asked right at start: the first reading, not "nothing free".
    await service.firstReading();
    const watched = service.watched().map((entry) => entry.deviceId);
    if (watched.length === 0) {
      throw new SceneError(say(TEXT, language, 'noParking'));
    }
    const chosen = chosenIds(fields?.parkings).filter((id) => watched.includes(id));
    if (chosenIds(fields?.parkings).length > 0 && chosen.length === 0) {
      throw new SceneError(say(TEXT, language, 'gone'));
    }
    let best = null;
    for (const deviceId of chosen.length > 0 ? chosen : watched) {
      const found = service.lookup(deviceId);
      const reading = found?.reading;
      if (
        !reading ||
        reading.free === null ||
        reading.free === 0 ||
        reading.open === 0 ||
        service.isStale(found.city, reading)
      ) {
        continue;
      }
      if (!best || reading.free > best.reading.free) {
        best = { ...found, deviceId };
      }
    }
    if (!best) {
      return {
        found: 0,
        sentence: say(TEXT, language, 'noneFree'),
        parking_name: '',
        city: '',
        free: 0,
        total: 0,
        occupancy: 0,
      };
    }
    const { city, reading } = best;
    const name = prettyName(reading.name);
    return {
      found: 1,
      sentence: say(TEXT, language, 'sentence', { ...reading, name }),
      parking_name: name,
      city: city.source.name,
      free: reading.free,
      total: reading.total ?? 0,
      occupancy: occupancy(reading) ?? 0,
    };
  },
};
