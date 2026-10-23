# Battery payback: data source

Demo `battery-payback`. One calendar year (2017, Europe/Berlin) of hourly PV generation, grid import and grid export of one household in Konstanz, Germany.

## Source

- Data (60-minute, single index): https://data.open-power-system-data.org/household_data/2020-04-15/household_data_60min_singleindex.csv
- Package page: https://data.open-power-system-data.org/household_data/2020-04-15/

## Licence

CC BY 4.0

- The package README (https://data.open-power-system-data.org/household_data/2020-04-15/README.md) states "Data license: Creative Commons Attribution-International", and its datapackage.json lists the licence id `CC-BY-4.0` (https://creativecommons.org/licenses/by/4.0/).
- The attribution below is copied verbatim from the README's "License and attribution" section (line breaks joined).

## Attribution

Open Power System Data. 2020. Data Package Household Data. Version 2020-04-15. https://data.open-power-system-data.org/household_data/2020-04-15/. (Primary data from various sources, for a complete list see URL).

## Retrieved

2026-10-23

## Regenerate

```sh
npm run demo-data -- battery-payback            # download into scripts/demo-data/.cache/battery-payback/
npm run demo-data -- battery-payback --offline  # rebuild from that cache
```

## Rows

- Raw: 38454 hourly rows, 2014-12-11T17:00:00Z to 2019-05-01T22:00:00Z.
- Households with PV, grid import and grid export: DE_KN_residential3, DE_KN_residential4, DE_KN_residential6. Whole years considered (measured / hours): DE_KN_residential3 2015 0/8760; DE_KN_residential3 2016 7148/8784; DE_KN_residential3 2017 4029/8760; DE_KN_residential3 2018 0/8760; DE_KN_residential4 2015 1243/8760; DE_KN_residential4 2016 6125/8784; DE_KN_residential4 2017 8704/8760; DE_KN_residential4 2018 832/8760.
- Chosen: DE_KN_residential4, 2017: 8760 hours, 8704 measured (99.36%), 56 interpolated by OPSD (kept, flagged), 0 gaps; 0 hours where a meter reading decreased (the columns are cumulative).
- `hourly.csv`: 8760 rows. Year totals: PV 11710.034 kWh, import 4396.358 kWh, export 9363.408 kWh.

## Files

| File | Bytes | Gzipped |
|---|---:|---:|
| `site/public/data/battery-payback/hourly.csv` | 530995 | 81.1 KB |
| `site/public/data/battery-payback/meta.json` | 889 | 0.4 KB |

## Raw downloads (SHA-256)

| File | URL | Bytes | SHA-256 |
|---|---|---:|---|
| `household_data_60min_singleindex.csv` | https://data.open-power-system-data.org/household_data/2020-04-15/household_data_60min_singleindex.csv | 15654559 | `15956440b27465686eae2abf5895cbc3dab80f934a891bcb2f4f944428e97d60` |

## Processing

- OPSD timestamps mark the start of each hour; a cumulative reading belongs to that instant, so the energy of the hour starting at T is reading(T + 1 h) − reading(T), in kWh with 3 decimals (computed in whole Wh, exactly).
- Coverage rule: an hour is measured when both readings of all three columns are present, no delta is negative and OPSD's `interpolated` marker names none of the three columns at either reading. A household-year qualifies with ≥ 98% measured hours; the first qualifying household (in column order) is used, with its latest qualifying year.
- OPSD interpolated hours are kept (they come from linear interpolation of the cumulative meter, so energy is preserved) and flagged `interpolated = 1`; hours without readings would be empty (there are none in the chosen year).
- `local` is OPSD's `cet_cest_timestamp` verbatim; months and hours of day come from it. `utc` is `utc_timestamp`.
- Battery model (also on the page): 5 kWh usable, 90% round trip (the loss is taken when charging: 1 kWh of surplus stores 0.9 kWh), 2.5 kW charge and discharge limit, charged only from PV surplus (the hour's export) and discharged only into the hour's import. Each hour discharges first, then charges; the battery starts empty on January 1. The page's size slider keeps the power at half the capacity per hour.
- Tariff assumptions (shown on the page): import €0.30/kWh, feed-in €0.08/kWh, installed €700/kWh. Savings = import avoided × import price − export forgone × feed-in price; payback = installed cost / yearly savings (no degradation or discounting).

## Oracle

- `DE_KN_residential4_pv` meter: 12230.121 kWh at 2017-01-01T00:00:00+0100, 23940.155 kWh one year later; difference 11710.034 kWh = the sum of the hourly `pv` column.
- `DE_KN_residential4_grid_import` meter: 5073.570 kWh at 2017-01-01T00:00:00+0100, 9469.928 kWh one year later; difference 4396.358 kWh = the sum of the hourly `import` column.
- `DE_KN_residential4_grid_export` meter: 9447.889 kWh at 2017-01-01T00:00:00+0100, 18811.297 kWh one year later; difference 9363.408 kWh = the sum of the hourly `export` column.
- Generator's own battery total for 5 kWh: **€284.36** saved in 2017 (1347 kWh discharged, 1496.6 kWh charged); €3500 installed pays back in **12.31 years**.
- `answer.test.ts` sums the hourly import column without importing `answer.ts` and requires the meter difference exactly; it checks `answer.ts` against a hand-computed 3-day profile and against the generator total above to the cent.

## Design reference

An Our World in Data / Carbon Brief explainer: a white 640 px article column, a Source Serif 4 headline that states the answer, charts interleaved with short prose.
