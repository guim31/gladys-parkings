// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+).
//
// - parkings: the watched car parks, one status row each ("Feydeau" /
//   "165 / 490 libres"), green, orange from 80 % taken, red from 95 % or
//   full, grey when closed, without a live count or out of date.
//
// Budget of the core: 8 components, 2 texts, 1 status (10 rows).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { clip, occupancy } from './devices.js';
import { TEXT, say } from './messages.js';

export const MAX_ROWS = 10;
const MAX_LABEL = 40;

/** The color of a row, from the filling of the car park. */
export function parkingColor(service, city, reading) {
  if (!reading || reading.open === 0 || reading.free === null || service.isStale(city, reading)) {
    return WIDGET_COLORS.NEUTRAL;
  }
  const taken = occupancy(reading);
  if (reading.full || (taken !== null && taken >= 95)) {
    return WIDGET_COLORS.DANGER;
  }
  return taken !== null && taken >= 80 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS;
}

async function parkingsContent(service, { settings, language }) {
  await service.firstReading();
  const ttl = Math.max(60, service.config.refreshSeconds);
  const watched = service.watched();
  const chosen = Array.isArray(settings?.parkings) ? settings.parkings.map(String) : [];
  const entries =
    chosen.length > 0
      ? chosen.map((id) => watched.find((entry) => entry.deviceId === id)).filter(Boolean)
      : watched;
  if (entries.length === 0) {
    const key = chosen.length > 0 ? 'gone' : 'pickParking';
    return { ttl_seconds: ttl, components: [{ type: 'text', text: say(TEXT, language, key) }] };
  }
  return {
    ttl_seconds: ttl,
    components: [
      {
        type: 'status',
        items: entries.slice(0, MAX_ROWS).map((entry) => {
          const found = service.lookup(entry.deviceId);
          const reading = found?.reading ?? null;
          const label = clip(reading ? service.label(found.city, reading) : entry.name, MAX_LABEL);
          return {
            label,
            value: clip(service.shortText(found?.city, reading, language), 40),
            color: parkingColor(service, found?.city, reading),
          };
        }),
      },
    ],
  };
}

export const WIDGETS = {
  parkings: { get: parkingsContent },
};
