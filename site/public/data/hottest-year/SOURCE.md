# Hottest year: data source

Demo `hottest-year`. The daily global mean near-surface (2 m) air temperature from the ERA5 reanalysis, 1940 to the latest day, as the Copernicus Climate Change Service publishes it on Climate Pulse.

## Source

- Daily series: https://sites.ecmwf.int/data/climatepulse/data/series/era5_daily_series_2t_global.csv
- Climate Pulse: https://pulse.climate.copernicus.eu/
- ERA5 (single levels) in the Climate Data Store: https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels
- Oracle, C3S Global Climate Highlights 2024: https://climate.copernicus.eu/global-climate-highlights-2024

## Licence

CC BY 4.0

- The Climate Data Store catalogue lists ERA5 under CC-BY-4.0 (https://spdx.org/licenses/CC-BY-4.0).
- Attribution as C3S asks: "Generated using Copernicus Climate Change Service information"; the page and this file name C3S / ECMWF, ERA5 and Climate Pulse.

## Attribution

Copernicus Climate Change Service / ECMWF, ERA5 via Climate Pulse

## Retrieved

2026-10-27

## Regenerate

```sh
npm run demo-data -- hottest-year            # download into scripts/demo-data/.cache/hottest-year/
npm run demo-data -- hottest-year --offline  # rebuild from that cache
```

## Rows

- Raw: 31,710 days, 1940-01-01 to 2026-10-25; from 2026-10-25 the values are preliminary.
- `daily.json`: the same 31,710 daily means and the 366-day 1991–2020 climatology.
- Docs slice `global-temperature.ts`: 92 days of summer 2024, 366 daily anomalies of 2024 and 86 annual anomalies.

## Files

| File | Bytes | Gzipped |
|---|---:|---:|
| `site/public/data/hottest-year/daily.json` | 263849 | 67.8 KB |
| `site/public/data/hottest-year/oracle.json` | 185 | 0.2 KB |

## Raw downloads (SHA-256)

| File | URL | Bytes | SHA-256 |
|---|---|---:|---|
| `era5_daily_series_2t_global.csv` | https://sites.ecmwf.int/data/climatepulse/data/series/era5_daily_series_2t_global.csv | 1198521 | `eb9f7f8e3766d7fc47e36af4bf8d4363b072569180f26b537b722aef92f048f0` |

## Processing

- Rows are the file’s data lines; the comment header is skipped. The dates must run day by day from 1940-01-01 with a value on every day.
- Temperatures and the climatology are kept to 3 decimals (the file gives 3).
- The page derives each year’s mean, each date’s record and the 1991–2020 range from these values; anomalies are the day’s value less the climatology of its date.

## Oracle

- C3S Global Climate Highlights 2024: 2024 averaged 15.10 °C, 0.72 °C above 1991–2020; the warmest day on record was 2024-07-22 at 17.16 °C. `answer.test.ts` and the page's spec recompute both from `daily.json`.

## Design reference

Climate Pulse and Ed Hawkins’ warming stripes: a stripe per year from blue to red, and every year’s daily temperature drawn as one line, the recent years on top.
