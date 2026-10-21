// -----------------------------------------------------------------------------
// The open data sources: one adapter per city portal, each turning its own
// fields into the same reading of a car park:
//
//   { id, name, free, total, open, full, updatedAt, lat, lon }
//
//   free       spaces available, or null when the portal has no live count
//   total      capacity, or null
//   open       1 open, 0 closed (or for subscribers only), null when the
//              portal does not say (the source has no `open` feature then)
//   full       the operator's own "full" flag or threshold, else free === 0
//   updatedAt  date of the count in ms, or null when the portal gives none
//              (the age is then the age of the last successful read)
//
// Every source below was checked live on 2026-10-21 (test/fixtures/sources
// holds those answers). Keys are part of the device external ids: never
// rename one.
// -----------------------------------------------------------------------------

import { getJson } from './http.js';

const MAX_BODY_BYTES = 4e6;
// Opendatasoft caps `limit` at 100: a few pages at most.
const ODS_PAGE = 100;
const ODS_MAX_PAGES = 5;
// The Grenoble car park list (names, capacities) changes rarely.
const LIST_MAX_AGE_MS = 24 * 3600 * 1000;

/** A whole number, or null for a missing or non-numeric value. */
export function int(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}

/** A date in ms, or null. Accepts ISO strings and epoch milliseconds. */
export function time(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

const finite = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const coord = (value) =>
  value === null || value === undefined || String(value).trim() === '' ? null : finite(value);

/** Every record of an Opendatasoft Explore v2.1 dataset, page after page. */
async function odsRecords(fetch, base, dataset, query = {}) {
  const records = [];
  for (let page = 0; page < ODS_MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      ...query,
      limit: String(ODS_PAGE),
      offset: String(page * ODS_PAGE),
    });
    const url = `${base}/api/explore/v2.1/catalog/datasets/${dataset}/records?${params}`;
    const data = await getJson(fetch, url, { maxBytes: MAX_BODY_BYTES });
    const results = Array.isArray(data?.results) ? data.results : [];
    records.push(...results);
    if (results.length < ODS_PAGE || records.length >= Number(data?.total_count ?? 0)) {
      break;
    }
  }
  return records;
}

/** Builds a reading, filling `full` from `free` when the portal has no flag. */
function reading({ id, name, free, total, open = null, full, updatedAt = null, lat, lon }) {
  const known = free !== null;
  return {
    id: String(id),
    name: String(name ?? id).trim() || String(id),
    free,
    total: total && total > 0 ? total : null,
    open,
    full: known && open !== 0 ? Boolean(full ?? free === 0) || free === 0 : false,
    updatedAt,
    lat: coord(lat),
    lon: coord(lon),
  };
}

export const SOURCES = {
  // data.strasbourg.eu, "Occupation des parkings en temps réel" (no date).
  // etat: 1 open, 2 closed, 0 "live count unavailable".
  strasbourg: {
    name: 'Strasbourg',
    publisher: 'Eurométropole de Strasbourg',
    dataset:
      'https://data.strasbourg.eu/explore/dataset/occupation-parkings-temps-reel/information/',
    hasOpen: true,
    async read(fetch) {
      const records = await odsRecords(
        fetch,
        'https://data.strasbourg.eu',
        'occupation-parkings-temps-reel',
      );
      return records
        .filter((r) => r.ident !== undefined && r.ident !== null)
        .map((r) => {
          const state = int(r.etat);
          const known = state === 1 || state === 2;
          return reading({
            id: r.ident,
            name: r.nom_parking,
            free: known ? int(r.libre) : null,
            total: int(r.total),
            open: known ? (state === 1 ? 1 : 0) : null,
            lat: r.position?.lat,
            lon: r.position?.lon,
          });
        });
    },
  },

  // opendata.bordeaux-metropole.fr, "st_park_p": every car park of the
  // metropolis, the live ones flagged `connecte = 1`. etat: LIBRE, COMPLET, FERME.
  bordeaux: {
    name: 'Bordeaux Métropole',
    publisher: 'Bordeaux Métropole',
    dataset: 'https://opendata.bordeaux-metropole.fr/explore/dataset/st_park_p/information/',
    hasOpen: true,
    async read(fetch) {
      const records = await odsRecords(
        fetch,
        'https://opendata.bordeaux-metropole.fr',
        'st_park_p',
        {
          where: 'connecte=1',
          select: 'ident,nom,etat,total,libres,mdate,geo_point_2d',
        },
      );
      return records
        .filter((r) => r.ident)
        .map((r) => {
          const state = String(r.etat ?? '').toUpperCase();
          const known = ['LIBRE', 'COMPLET', 'FERME'].includes(state);
          return reading({
            id: r.ident,
            name: r.nom,
            free: known ? int(r.libres) : null,
            total: int(r.total),
            open: known ? (state === 'FERME' ? 0 : 1) : null,
            full: state === 'COMPLET',
            updatedAt: time(r.mdate),
            lat: r.geo_point_2d?.lat,
            lon: r.geo_point_2d?.lon,
          });
        });
    },
  },

  // data.nantesmetropole.fr, "Parkings publics de Nantes Métropole -
  // disponibilités". grp_statut: 5 open, 2 subscribers only, 1 closed,
  // 0 invalid count; grp_complet: the threshold under which the operator
  // displays "full".
  nantes: {
    name: 'Nantes Métropole',
    publisher: 'Nantes Métropole',
    dataset:
      'https://data.nantesmetropole.fr/explore/dataset/244400404_parkings-publics-nantes-disponibilites/information/',
    hasOpen: true,
    async read(fetch) {
      const records = await odsRecords(
        fetch,
        'https://data.nantesmetropole.fr',
        '244400404_parkings-publics-nantes-disponibilites',
      );
      return records
        .filter((r) => r.grp_identifiant !== undefined && r.grp_identifiant !== null)
        .map((r) => {
          const state = int(r.grp_statut);
          const known = [1, 2, 5].includes(state);
          const free = known ? int(r.grp_disponible) : null;
          const threshold = int(r.grp_complet);
          return reading({
            id: r.grp_identifiant,
            name: r.grp_nom,
            free,
            total: int(r.grp_exploitation),
            open: known ? (state === 5 ? 1 : 0) : null,
            full: free !== null && threshold !== null && free <= threshold,
            updatedAt: time(r.grp_horodatage),
            lat: r.location?.lat,
            lon: r.location?.lon,
          });
        });
    },
  },

  // data.rennesmetropole.fr, the city-centre car parks of Citédia (no date).
  rennes: {
    name: 'Rennes (Citédia)',
    publisher: 'Rennes Métropole',
    dataset:
      'https://data.rennesmetropole.fr/explore/dataset/export-api-parking-citedia/information/',
    hasOpen: true,
    async read(fetch) {
      const records = await odsRecords(
        fetch,
        'https://data.rennesmetropole.fr',
        'export-api-parking-citedia',
        { select: 'id,key,status,max,free,geo' },
      );
      return records
        .filter((r) => r.id)
        .map((r) => {
          const state = String(r.status ?? '').toUpperCase();
          const known = state === 'OUVERT' || state === 'FERME';
          return reading({
            id: r.id,
            name: r.key,
            free: known ? int(r.free) : null,
            total: int(r.max),
            open: known ? (state === 'OUVERT' ? 1 : 0) : null,
            lat: r.geo?.lat,
            lon: r.geo?.lon,
          });
        });
    },
  },

  // data.explore.star.fr, the park-and-ride car parks of the STAR network.
  // The "solo" counters are the ordinary spaces (car-pool, electric and
  // disabled spaces are counted apart).
  rennes_star: {
    name: 'Rennes (parcs relais STAR)',
    publisher: 'STAR / Rennes Métropole',
    dataset:
      'https://data.explore.star.fr/explore/dataset/tco-parcsrelais-star-etat-tr/information/',
    hasOpen: true,
    async read(fetch) {
      const records = await odsRecords(
        fetch,
        'https://data.explore.star.fr',
        'tco-parcsrelais-star-etat-tr',
        {
          select:
            'idparc,nom,coordonnees,lastupdate,capacitesoliste,jrdinfosoliste,etatouverture,etatremplissage',
        },
      );
      return records
        .filter((r) => r.idparc)
        .map((r) => {
          const state = String(r.etatouverture ?? '').toUpperCase();
          const known = state === 'OUVERT' || state === 'FERME';
          return reading({
            id: r.idparc,
            name: r.nom,
            free: known ? int(r.jrdinfosoliste) : null,
            total: int(r.capacitesoliste),
            open: known ? (state === 'OUVERT' ? 1 : 0) : null,
            full: String(r.etatremplissage ?? '').toUpperCase() === 'COMPLET',
            updatedAt: time(r.lastupdate),
            lat: r.coordonnees?.lat,
            lon: r.coordonnees?.lon,
          });
        });
    },
  },

  // data.mobilites-m.fr (SMMAG, Grenoble area): the list of car parks
  // (names, capacities) and their live counts, two documents. Most car parks
  // of the list have no sensor (null counts): they are not offered in the
  // Discover tab. A failing list read keeps the list already known.
  grenoble: {
    name: 'Grenoble (M réso)',
    publisher: 'SMMAG – Mobilités M',
    dataset: 'https://data.mobilites-m.fr/donnees',
    hasOpen: false,
    async read(fetch, cache, now) {
      if (!cache.list || now - cache.listAt > LIST_MAX_AGE_MS) {
        try {
          const list = await getJson(
            fetch,
            'https://data.mobilites-m.fr/api/findType/json?types=parking',
            { maxBytes: MAX_BODY_BYTES },
          );
          cache.list = new Map(
            (Array.isArray(list?.features) ? list.features : [])
              .filter((f) => f?.properties?.code)
              .map((f) => [
                String(f.properties.code),
                {
                  name: f.properties.nom,
                  total: int(f.properties.nb_places),
                  lon: f.geometry?.coordinates?.[0],
                  lat: f.geometry?.coordinates?.[1],
                },
              ]),
          );
          cache.listAt = now;
        } catch (err) {
          if (!cache.list) {
            throw err;
          }
          // The list already known is still good: tried again in an hour.
          cache.listAt = now - LIST_MAX_AGE_MS + 3600 * 1000;
        }
      }
      const counts = await getJson(fetch, 'https://data.mobilites-m.fr/api/dyn/parking/json', {
        maxBytes: MAX_BODY_BYTES,
      });
      return Object.entries(counts && typeof counts === 'object' ? counts : {})
        .filter(([code]) => cache.list.has(code))
        .map(([code, live]) => {
          const info = cache.list.get(code);
          return reading({
            id: code,
            name: info.name,
            free: int(live?.nb_places_libres),
            total: info.total,
            updatedAt: time(live?.time),
            lat: info.lat,
            lon: info.lon,
          });
        });
    },
  },

  // data.grandpoitiers.fr (Data Fair), "Stationnement des parkings en temps réel".
  poitiers: {
    name: 'Grand Poitiers',
    publisher: 'Grand Poitiers',
    dataset:
      'https://data.grandpoitiers.fr/datasets/mobilites-stationnement-des-parkings-en-temps-reel',
    hasOpen: false,
    async read(fetch) {
      const data = await getJson(
        fetch,
        'https://data.grandpoitiers.fr/data-fair/api/v1/datasets/mobilites-stationnement-des-parkings-en-temps-reel/lines?size=100',
        { maxBytes: MAX_BODY_BYTES },
      );
      return (Array.isArray(data?.results) ? data.results : [])
        .filter((r) => r.Id !== undefined && r.Id !== null)
        .map((r) => {
          const [lat, lon] = String(r._geopoint ?? '').split(',');
          return reading({
            id: r.Id,
            name: r.Nom,
            free: int(r.Places),
            total: int(r.Capacite),
            updatedAt: time(r['Dernière_mise_à_jour_Base']),
            lat,
            lon,
          });
        });
    },
  },
};

export const SOURCE_KEYS = Object.keys(SOURCES);
