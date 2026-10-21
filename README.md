# Gladys Live car parks

External integration for [Gladys Assistant](https://gladysassistant.com): the
**free spaces of public car parks** in French cities, read live from their
open data portals: **Strasbourg, Bordeaux Métropole, Nantes Métropole, Rennes**
(Citédia car parks and STAR park-and-ride), **the Grenoble area** and **Grand
Poitiers**. **No account, no key.**

Unofficial: not affiliated with the cities, metropolises or car park
operators. Developed without the hardware: the seven sources were checked live
on 2026-10-21, not yet on many Gladys installations: feedback welcome.

User documentation: [English](docs/en.md) · [français](docs/fr.md) ·
[Deutsch](docs/de.md) · [español](docs/es.md).

## What you get in Gladys

| Kind                 | Content                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Devices              | one per car park added: free spaces, total spaces, occupancy (%), open (by city), data age |
| Dashboard widget     | "Car parks": one row per car park, colored by how full it is                               |
| Scene triggers       | free spaces below a threshold / back above it (5 to 100), car park full, car park closed   |
| Scene action         | find the open car park with the most free spaces: a sentence and numbers                   |
| Configuration action | status: cities read, last readings, errors                                                 |

Requires Gladys **5.1.0** or later.

## Installation

In Gladys: **Integrations → Install from GitHub**, then
`https://github.com/guim31/gladys-parkings`. Tick your cities in the
configuration, then add your car parks from the **Discover** tab.

## How it works

- One adapter per portal (`src/sources.js`): Opendatasoft Explore v2.1 for
  Strasbourg, Bordeaux, Nantes, Rennes and STAR, the Mobilités M API for
  Grenoble, Data Fair for Poitiers.
- The cities ticked, and those of the car parks added, are read every 2, 3 or
  5 minutes: one request per city (two for Grenoble). Devices are published
  with `should_poll: false`: the container runs its own timer.
- A count older than 30 minutes (date of the portal, else of the last
  successful read) is out of date: grey in the widget, never chosen by the
  scene action, never compared by the triggers.

## Limitations

- **Toulouse** only publishes static data (no free spaces). **Lyon** and
  **Angers** publish free spaces without capacities, **Montpellier** was down
  during the tests, and no public feed was found for **Lille** and **Metz**:
  not supported for now.
- The figures are the operators' own, refreshed every one to five minutes.
- Read only.

## Development

```bash
npm install
npm test               # node --test, no network access
npm run lint           # ESLint
npm run format:check   # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store .   # store admission checks
```

See [CLAUDE.md](CLAUDE.md) for the architecture and the conventions. The test
fixtures (`test/fixtures/sources`) are the real answers of the seven portals,
captured on 2026-10-21.

## Credits

- Data: Eurométropole de Strasbourg, Bordeaux Métropole, Nantes Métropole,
  Rennes Métropole and STAR, SMMAG – Mobilités M and Grand Poitiers, under
  their open licences (Licence Ouverte / ODbL).
- Same use case as community Home Assistant car park integrations (no code
  taken from them).
- Built from the official
  [integration template](https://github.com/GladysAssistant/integration-template-js).

## License

[Apache 2.0](LICENSE).
