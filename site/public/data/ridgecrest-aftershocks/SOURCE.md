# Ridgecrest aftershocks: data source

Demo `ridgecrest-aftershocks`. Every catalogued event of the 2019 Ridgecrest, California sequence in a fixed box, July to September 2019.

## Source

- Events (FDSN event service, CSV): https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&orderby=time-asc&starttime=2019-07-01T00:00:00&endtime=2019-09-30T00:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2
- Count check: https://earthquake.usgs.gov/fdsnws/event/1/count?starttime=2019-07-01T00:00:00&endtime=2019-09-30T00:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2
- Service documentation: https://earthquake.usgs.gov/fdsnws/event/1/

## Licence

U.S. public domain

- USGS: "USGS-authored or produced data and information are considered to be in the U.S. public domain" (https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits).
- ComCat is the ANSS Comprehensive Earthquake Catalog operated by the USGS; the requested catalogue fields are USGS products.

## Attribution

U.S. Geological Survey, ANSS ComCat

## Retrieved

2026-10-23

## Regenerate

```sh
npm run demo-data -- ridgecrest-aftershocks            # download into scripts/demo-data/.cache/ridgecrest-aftershocks/
npm run demo-data -- ridgecrest-aftershocks --offline  # rebuild from that cache
```

## Rows

- /count for the whole query on the retrieval date: 39245 events.
- `events.csv`: 39244 events (2661 of magnitude 2.5 or more); 1 event without a magnitude dropped.
- Event types: earthquake 39241, quarry blast 3.
- Query windows (each under 20000 events): 2019-07-01T00:00:00–2019-07-12T09:00:00 (15699); 2019-07-12T09:00:00–2019-07-23T18:00:00 (8027); 2019-07-23T18:00:00–2019-08-15T12:00:00 (7345); 2019-08-15T12:00:00–2019-09-30T00:00:00 (8174).

## Files

| File | Bytes | Gzipped |
|---|---:|---:|
| `site/public/data/ridgecrest-aftershocks/events.csv` | 2421250 | 671.4 KB |
| `site/public/data/ridgecrest-aftershocks/oracle.json` | 961 | 0.3 KB |

## Raw downloads (SHA-256)

| File | URL | Bytes | SHA-256 |
|---|---|---:|---|
| `count-2019-07-01T000000-2019-09-30T000000.txt` | https://earthquake.usgs.gov/fdsnws/event/1/count?starttime=2019-07-01T00:00:00&endtime=2019-09-30T00:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2 | 5 | `659b37837a0a4ed6b5d67940a73313c51e27a8720d710b42ca71f87e20ba90d2` |
| `count-2019-07-01T000000-2019-08-15T120000.txt` | https://earthquake.usgs.gov/fdsnws/event/1/count?starttime=2019-07-01T00:00:00&endtime=2019-08-15T12:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2 | 5 | `55d6c2a4020b4e3144537a1ed7466fc2a7ec8081d3fdef33946e815fd0b264fc` |
| `count-2019-07-01T000000-2019-07-23T180000.txt` | https://earthquake.usgs.gov/fdsnws/event/1/count?starttime=2019-07-01T00:00:00&endtime=2019-07-23T18:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2 | 5 | `63d498345be85978a9c9366cf70329ce16a25b72092794be1dcc904232cc7d99` |
| `count-2019-07-01T000000-2019-07-12T090000.txt` | https://earthquake.usgs.gov/fdsnws/event/1/count?starttime=2019-07-01T00:00:00&endtime=2019-07-12T09:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2 | 5 | `5f899f9555e3febd30c5eee51f70c506379631cb1a1cd67bf03455750c36e2c4` |
| `count-2019-07-12T090000-2019-07-23T180000.txt` | https://earthquake.usgs.gov/fdsnws/event/1/count?starttime=2019-07-12T09:00:00&endtime=2019-07-23T18:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2 | 4 | `2e6e055e719e728fa0705c1a9770872f7c57b08cdc771b611118dca2c77672f7` |
| `count-2019-07-23T180000-2019-08-15T120000.txt` | https://earthquake.usgs.gov/fdsnws/event/1/count?starttime=2019-07-23T18:00:00&endtime=2019-08-15T12:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2 | 4 | `26b78cac2702b82b75d6b5bcead72ba2f6da3f5631ff399ded8c8ee294425454` |
| `count-2019-08-15T120000-2019-09-30T000000.txt` | https://earthquake.usgs.gov/fdsnws/event/1/count?starttime=2019-08-15T12:00:00&endtime=2019-09-30T00:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2 | 4 | `a40c943151f1eebabdf85135c3de1005ec902fe787e29c2190df5e01e39222ce` |
| `events-2019-07-01T000000-2019-07-12T090000.csv` | https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&orderby=time-asc&starttime=2019-07-01T00:00:00&endtime=2019-07-12T09:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2 | 3017265 | `f7be132688fc4a3774c4605f08b1060a68f25965c45b97b6b26f1c41d8f1778b` |
| `events-2019-07-12T090000-2019-07-23T180000.csv` | https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&orderby=time-asc&starttime=2019-07-12T09:00:00&endtime=2019-07-23T18:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2 | 1545663 | `335d381f72dbc85c7fb792ec55fc1ad778643f9b46bf1be6fbe4903879777be9` |
| `events-2019-07-23T180000-2019-08-15T120000.csv` | https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&orderby=time-asc&starttime=2019-07-23T18:00:00&endtime=2019-08-15T12:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2 | 1413897 | `65167b7e5ca3617980760156e470d6602f9b06d9ab70add5ced9c7aa18809349` |
| `events-2019-08-15T120000-2019-09-30T000000.csv` | https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&orderby=time-asc&starttime=2019-08-15T12:00:00&endtime=2019-09-30T00:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2 | 1573843 | `5fa56d95879992726f2c15d0e5f483e9eb802037ffe694648c30dac309dca39f` |
| `oracle-2019-07-06.txt` | https://earthquake.usgs.gov/fdsnws/event/1/count?starttime=2019-07-06T00:00:00&endtime=2019-07-07T00:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2&minmagnitude=2.5 | 4 | `f97350101e1a9de922bdbb762a33695234102dc119ffafa25c15d0418ec82b23` |
| `oracle-2019-07-08.txt` | https://earthquake.usgs.gov/fdsnws/event/1/count?starttime=2019-07-08T00:00:00&endtime=2019-07-09T00:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2&minmagnitude=2.5 | 3 | `0fd42b3f73c448b34940b339f87d07adf116b05c0227aad72e8f0ee90533e699` |
| `oracle-2019-08-22.txt` | https://earthquake.usgs.gov/fdsnws/event/1/count?starttime=2019-08-22T00:00:00&endtime=2019-08-23T00:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2&minmagnitude=2.5 | 2 | `8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61` |

## Processing

- `time` is the origin time in epoch milliseconds (UTC); `lat`/`lon` in degrees (4 decimals); `depth` in km below sea level (2 decimals; negative is above sea level); `mag` as catalogued (mixed magnitude types, 2 decimals); `id` is the ComCat event id.
- `depthBand`: `0–5 km` for depth ≤ 5 (negative depths included), `5–10 km` for 5 < depth ≤ 10, `>10 km` above 10.
- FDSN window bounds are inclusive, so events are de-duplicated by `id`; rows are sorted by time, then id.
- All event types are kept (as in the `/count` oracle, which has no type filter).

## Oracle

- USGS `/count` with `minmagnitude=2.5` for UTC day 2019-07-06: **1239** (https://earthquake.usgs.gov/fdsnws/event/1/count?starttime=2019-07-06T00:00:00&endtime=2019-07-07T00:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2&minmagnitude=2.5).
- USGS `/count` with `minmagnitude=2.5` for UTC day 2019-07-08: **109** (https://earthquake.usgs.gov/fdsnws/event/1/count?starttime=2019-07-08T00:00:00&endtime=2019-07-09T00:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2&minmagnitude=2.5).
- USGS `/count` with `minmagnitude=2.5` for UTC day 2019-08-22: **14** (https://earthquake.usgs.gov/fdsnws/event/1/count?starttime=2019-08-22T00:00:00&endtime=2019-08-23T00:00:00&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2&minmagnitude=2.5).
- `answer.test.ts` recounts those days from `events.csv` without importing `answer.ts` and requires equality; the values are also in `oracle.json`.

## Design reference

USGS event pages and helicorder plots: white `#FFFFFF`, black ink, thin grey rules; depth bands `#de4968` (0–5 km), `#8c2981` (5–10 km), `#3b0f70` (>10 km); the system UI stack with tabular figures; a full-width daily-count strip like a helicorder trace on top, then the scatter and the decay plot side by side at 1280 px.
