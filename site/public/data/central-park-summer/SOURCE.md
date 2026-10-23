# Central Park summer 2025: data source

Demo `central-park-summer`. Daily maximum and minimum temperature at NY City Central Park (GHCN-Daily USW00094728), reduced to a per-day climatology and the 2025 June–August observations.

## Source

- Daily observations: https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/USW00094728.csv
- Oracle, 1991–2020 monthly normals: https://www.ncei.noaa.gov/data/normals-monthly/1991-2020/access/USW00094728.csv
- Product page: https://www.ncei.noaa.gov/products/land-based-station/global-historical-climatology-network-daily
- Format: https://www.ncei.noaa.gov/pub/data/ghcn/daily/readme.txt

## Licence

U.S. Government work (public domain)

- NOAA NCEI data are produced by a U.S. federal agency and are not subject to copyright in the United States (17 U.S.C. §105); the GHCN-Daily product page lists no use restrictions.
- WMO Resolution 40 restrictions apply only to some non-U.S. stations; USW00094728 is a U.S. NWS station.
- Cite as Menne et al. (2012), Global Historical Climatology Network - Daily (GHCN-Daily), Version 3, NOAA NCEI, doi:10.7289/V5D21VHZ.

## Attribution

NOAA NCEI GHCN-Daily, doi:10.7289/V5D21VHZ

## Retrieved

2026-10-23

## Regenerate

```sh
npm run demo-data -- central-park-summer            # download into scripts/demo-data/.cache/central-park-summer/
npm run demo-data -- central-park-summer --offline  # rebuild from that cache
```

## Rows

- Raw: 57626 days with TMAX or TMIN, 1869–2026; 68 values with a GHCN quality flag skipped.
- `summer.json`: 366 calendar days of climatology and 92 days of 2025 (June 1 to August 31).

## Files

| File | Bytes | Gzipped |
|---|---:|---:|
| `site/public/data/central-park-summer/summer.json` | 101371 | 7.0 KB |
| `site/public/data/central-park-summer/oracle.json` | 719 | 0.3 KB |

## Raw downloads (SHA-256)

| File | URL | Bytes | SHA-256 |
|---|---|---:|---|
| `USW00094728.csv` | https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/USW00094728.csv | 17838327 | `eb340d1b03f0c1820d22744105e8767e9d5dba54e3c014e552188e464430f331` |
| `normals-monthly-USW00094728.csv` | https://www.ncei.noaa.gov/data/normals-monthly/1991-2020/access/USW00094728.csv | 41702 | `7a8d8f2d6e97a2000d959383784cd8034d8fdf1560705bb47f3d65642b37e0fd` |

## Processing

- GHCN-Daily TMAX/TMIN are tenths of °C; converted with °F = °C × 9/5 + 32 and rounded to whole °F, which recovers the whole-°F U.S. observation exactly (the tenths-of-°C storage is off by at most 0.09 °F). Values with a non-blank quality flag (QFLAG) are skipped.
- Records: the highest TMAX and lowest TMIN for each calendar day over 1869–2024 (2025 excluded, so 2025 can set records), compared in whole °F; ties keep the most recent year.
- Normal band: the 10th, 50th and 90th percentiles (linear interpolation, R-7) of 1991–2020 daily TMAX within ±7 calendar days of the day (a 15-day window, about 450 values; 02-29 is its own slot).
- `meanHigh`: the plain 1991–2020 mean TMAX of that exact calendar day, kept for the monthly-normals oracle.
- `summer2025`: the observed daily high and low of every day from 2025-06-01 to 2025-08-31.

## Oracle

- NCEI 1991–2020 `MLY-TMAX-NORMAL` for month 06: **79.7 °F** (29 years). The mean of that month's `meanHigh` values must be within ±1 °F.
- NCEI 1991–2020 `MLY-TMAX-NORMAL` for month 07: **84.9 °F** (28 years). The mean of that month's `meanHigh` values must be within ±1 °F.
- NCEI 1991–2020 `MLY-TMAX-NORMAL` for month 08: **83.3 °F** (28 years). The mean of that month's `meanHigh` values must be within ±1 °F.
- Record high for 06-01 from a separate scan of the raw file: **96 °F** (356 tenths °C, 1895).
- Record high for 06-24 from a separate scan of the raw file: **96 °F** (356 tenths °C, 1888).
- Record high for 07-04 from a separate scan of the raw file: **102 °F** (389 tenths °C, 1949).
- Record high for 07-22 from a separate scan of the raw file: **104 °F** (400 tenths °C, 2011).
- Record high for 08-15 from a separate scan of the raw file: **97 °F** (361 tenths °C, 1988).
- `answer.test.ts` checks both against `summer.json` without importing `answer.ts` (values also in `oracle.json`); with the raw cache present it also recomputes the whole climatology and requires equality.

## Design reference

Tufte's reproduction of the 1980 *New York Times* weather chart (The Visual Display of Quantitative Information): newsprint cream `#FBF8F1`, greys plus one red `#C0392B` and one blue `#2E6DB4`, Libre Caslon Text for text and Libre Franklin for chart labels, one long chart with a one-line reading key.
