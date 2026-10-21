// -----------------------------------------------------------------------------
// Texts sent from the container (feature names, action messages, widget
// contents, scene outputs), in the four languages of the Gladys interface.
// Entries are strings or functions of one parameter object. German says "du",
// Spanish "usted". Brand and place names never translate.
// -----------------------------------------------------------------------------

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

// Feature names, frozen when the device is created (configured language).
export const NAMES = {
  en: {
    free: 'Free spaces',
    total: 'Total spaces',
    occupancy: 'Occupancy',
    open: 'Open',
    age: 'Data age',
  },
  fr: {
    free: 'Places libres',
    total: 'Places totales',
    occupancy: "Taux d'occupation",
    open: 'Ouvert',
    age: 'Âge de la donnée',
  },
  de: {
    free: 'Freie Plätze',
    total: 'Plätze gesamt',
    occupancy: 'Belegung',
    open: 'Geöffnet',
    age: 'Alter der Daten',
  },
  es: {
    free: 'Plazas libres',
    total: 'Plazas totales',
    occupancy: 'Ocupación',
    open: 'Abierto',
    age: 'Antigüedad del dato',
  },
};

const plural = (count, one, many) => (count === 1 ? one : many);
const pluralFr = (count, one, many) => (count > 1 ? many : one);

// Widget contents and scene outputs.
export const TEXT = {
  en: {
    counts: ({ free, total }) =>
      total ? `${free} / ${total} free` : `${free} ${plural(free, 'space', 'spaces')}`,
    closed: 'closed',
    full: 'full',
    stale: 'data out of date',
    unknown: 'no live count',
    sentence: ({ name, free, total }) =>
      `${name}: ${free} free ${plural(free, 'space', 'spaces')}${total ? ` out of ${total}` : ''}.`,
    noneFree: 'No watched car park has a free space right now.',
    pickParking: 'Add a car park in the Discover tab of the integration, then pick it here.',
    gone: 'This car park is no longer watched.',
    noParking: 'No car park is watched: add one in the Discover tab of the integration.',
  },
  fr: {
    counts: ({ free, total }) =>
      total
        ? `${free} / ${total} ${pluralFr(free, 'libre', 'libres')}`
        : `${free} ${pluralFr(free, 'place', 'places')}`,
    closed: 'fermé',
    full: 'complet',
    stale: 'donnée périmée',
    unknown: 'pas de comptage en direct',
    sentence: ({ name, free, total }) =>
      `${name} : ${free} ${pluralFr(free, 'place libre', 'places libres')}${total ? ` sur ${total}` : ''}.`,
    noneFree: "Aucun parking suivi n'a de place libre en ce moment.",
    pickParking:
      "Ajoutez un parking dans l'onglet Découverte de l'intégration, puis choisissez-le ici.",
    gone: "Ce parking n'est plus suivi.",
    noParking:
      "Aucun parking n'est suivi : ajoutez-en un dans l'onglet Découverte de l'intégration.",
  },
  de: {
    counts: ({ free, total }) =>
      total ? `${free} / ${total} frei` : `${free} ${plural(free, 'Platz', 'Plätze')}`,
    closed: 'geschlossen',
    full: 'voll',
    stale: 'Daten veraltet',
    unknown: 'keine Live-Zählung',
    sentence: ({ name, free, total }) =>
      `${name}: ${free} ${plural(free, 'freier Platz', 'freie Plätze')}${total ? ` von ${total}` : ''}.`,
    noneFree: 'Kein überwachtes Parkhaus hat gerade einen freien Platz.',
    pickParking: 'Füge ein Parkhaus im Tab „Entdecken“ der Integration hinzu und wähle es hier.',
    gone: 'Dieses Parkhaus wird nicht mehr überwacht.',
    noParking: 'Kein Parkhaus wird überwacht: füge eines im Tab „Entdecken“ der Integration hinzu.',
  },
  es: {
    counts: ({ free, total }) =>
      total
        ? `${free} / ${total} ${plural(free, 'libre', 'libres')}`
        : `${free} ${plural(free, 'plaza', 'plazas')}`,
    closed: 'cerrado',
    full: 'completo',
    stale: 'dato caducado',
    unknown: 'sin recuento en directo',
    sentence: ({ name, free, total }) =>
      `${name}: ${free} ${plural(free, 'plaza libre', 'plazas libres')}${total ? ` de ${total}` : ''}.`,
    noneFree: 'Ningún aparcamiento vigilado tiene plazas libres en este momento.',
    pickParking:
      'Añada un aparcamiento en la pestaña Descubrir de la integración y luego elíjalo aquí.',
    gone: 'Este aparcamiento ya no está vigilado.',
    noParking:
      'No se vigila ningún aparcamiento: añada uno en la pestaña Descubrir de la integración.',
  },
};

// Answer of the "Status" configuration action.
export const REPORTS = {
  en: {
    noCity: 'No city chosen: tick one or more cities above, then save.',
    city: ({ name, count }) =>
      `■ ${name}: ${count} car park${count === 1 ? '' : 's'} with a live count`,
    read: ({ age }) => `Last reading ${age} s ago.`,
    waiting: 'Not read yet.',
    error: ({ error }) => `Last error: ${error}`,
    watched: ({ count }) => `${count} car park${count === 1 ? '' : 's'} added to Gladys.`,
  },
  fr: {
    noCity: 'Aucune ville choisie : cochez une ou plusieurs villes ci-dessus, puis enregistrez.',
    city: ({ name, count }) =>
      `■ ${name} : ${count} parking${count > 1 ? 's' : ''} avec comptage en direct`,
    read: ({ age }) => `Dernière lecture il y a ${age} s.`,
    waiting: 'Pas encore lu.',
    error: ({ error }) => `Dernière erreur : ${error}`,
    watched: ({ count }) =>
      `${count} parking${count > 1 ? 's' : ''} ajouté${count > 1 ? 's' : ''} à Gladys.`,
  },
  de: {
    noCity: 'Keine Stadt gewählt: kreuze oben eine oder mehrere Städte an und speichere.',
    city: ({ name, count }) =>
      `■ ${name}: ${count} ${count === 1 ? 'Parkhaus' : 'Parkhäuser'} mit Live-Zählung`,
    read: ({ age }) => `Letzte Abfrage vor ${age} s.`,
    waiting: 'Noch nicht abgefragt.',
    error: ({ error }) => `Letzter Fehler: ${error}`,
    watched: ({ count }) =>
      `${count} ${count === 1 ? 'Parkhaus' : 'Parkhäuser'} zu Gladys hinzugefügt.`,
  },
  es: {
    noCity: 'Ninguna ciudad elegida: marque una o varias ciudades arriba y guarde.',
    city: ({ name, count }) =>
      `■ ${name}: ${count} aparcamiento${count === 1 ? '' : 's'} con recuento en directo`,
    read: ({ age }) => `Última lectura hace ${age} s.`,
    waiting: 'Aún no leído.',
    error: ({ error }) => `Último error: ${error}`,
    watched: ({ count }) =>
      `${count} aparcamiento${count === 1 ? '' : 's'} añadido${count === 1 ? '' : 's'} a Gladys.`,
  },
};

/** One text of a table, in a language (English when missing). */
export function say(table, language, key, params = {}) {
  const entry = table[language]?.[key] ?? table.en[key];
  return typeof entry === 'function' ? entry(params) : entry;
}

/** The same text in every language of the table: `{ en, fr, de, es }`. */
export function render(table, key, params = {}) {
  return Object.fromEntries(
    Object.keys(table).map((language) => [language, say(table, language, key, params)]),
  );
}

/** Joins rendered messages (or plain strings), language by language, one per line. */
export function lines(...messages) {
  const languages = Object.keys(messages.find((m) => typeof m === 'object' && m) ?? { en: '' });
  return Object.fromEntries(
    languages.map((language) => [
      language,
      messages
        .filter((message) => message !== null && message !== undefined)
        .map((message) => (typeof message === 'string' ? message : message[language]))
        .join('\n'),
    ]),
  );
}
