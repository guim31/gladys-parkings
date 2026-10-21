# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Live free spaces of the public car parks of Strasbourg, Bordeaux Métropole,
  Nantes Métropole, Rennes (Citédia car parks and STAR park-and-ride), the
  Grenoble area and Grand Poitiers, from their open data portals: no account,
  no key.
- Tick your cities in the configuration: their car parks with a live count
  show in the Discover tab, one device each with free spaces, total spaces,
  occupancy, open or closed (where the city publishes it) and the age of the
  data, read every 2, 3 or 5 minutes.
- Dashboard widget "Car parks": one row per car park, green, orange or red
  depending on how full it is, grey when closed or out of date.
- Scene triggers: free spaces below a threshold, free spaces back, car park
  full, car park closed.
- Scene action "Find the car park with the most free spaces", with a sentence
  ready to send.
- "Status" configuration action: cities read, last readings and errors.
- Texts and documentation in English, French, German and Spanish.
