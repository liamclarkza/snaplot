# Find the clipping: data source

Demo `find-the-clipping`. One public-domain recording from the Internet Archive, bundled byte-for-byte as `recording.mp3` and decoded in the browser.

## Source

- Recording: https://archive.org/download/12-02-21_Space-to-Ground-Comm_PDAM-prep-conversation/12-02-21_Space-to-Ground-Comm_PDAM-prep-conversation.mp3
- Item page: https://archive.org/details/12-02-21_Space-to-Ground-Comm_PDAM-prep-conversation
- Search (537 items): https://archive.org/advancedsearch.php?q=collection%3Anasa+AND+mediatype%3Aaudio+AND+item_size%3A%5B1+TO+30000000%5D&fl%5B%5D=identifier&sort%5B%5D=downloads+desc&rows=100&output=json

## Licence

U.S. Government work (public domain)

- Internet Archive item `12-02-21_Space-to-Ground-Comm_PDAM-prep-conversation`: creator "john.l.stoll@nasa.gov" in the NASA collection (a U.S. government work).
- Creator field: john.l.stoll@nasa.gov; collection query `collection:nasa AND mediatype:audio` or `collection:librivoxaudio AND subject:poetry` (works of NASA employees are not subject to U.S. copyright, 17 U.S.C. §105; LibriVox recordings carry a public-domain dedication).

## Attribution

NASA via the Internet Archive, item 12-02-21_Space-to-Ground-Comm_PDAM-prep-conversation

## Retrieved

2026-10-23

## Regenerate

```sh
npm run demo-data -- find-the-clipping            # search, download and decode into scripts/demo-data/.cache/find-the-clipping/
npm run demo-data -- find-the-clipping --offline  # re-decode from that cache (needs Playwright's Chromium)
```

## Rows

- `recording.mp3`: 102.903 s, 44100 Hz, 2 channel(s), 4538034 samples per channel, 1256733 bytes.
- Candidates decoded: 4 (`STS-107` 0 runs / 19 silences; `04-19-2022_CAPCOM-Call-Ax-1_Update` 0 runs / 4 silences; `11-30-2021_Space-to-Ground-Comm-to-Delay-EVA` 0 runs / 7 silences; `12-02-21_Space-to-Ground-Comm_PDAM-prep-conversation` 12 runs / 5 silences).

## Files

| File | Bytes | Gzipped |
|---|---:|---:|
| `site/public/data/find-the-clipping/recording.mp3` | 1256733 | 1155.5 KB |
| `site/public/data/find-the-clipping/recording.json` | 1057 | 0.5 KB |

## Raw downloads (SHA-256)

| File | URL | Bytes | SHA-256 |
|---|---|---:|---|
| `search-collection_nasa_AND_mediatype_audio.json` | https://archive.org/advancedsearch.php?q=collection%3Anasa+AND+mediatype%3Aaudio+AND+item_size%3A%5B1+TO+30000000%5D&fl%5B%5D=identifier&sort%5B%5D=downloads+desc&rows=100&output=json | 5595 | `566f354a319095d1b097a7aa8309d078f316c944b67a8d78cab919ad3a1751b8` |
| `meta-STS-107.json` | https://archive.org/metadata/STS-107 | 8737 | `e31a41377fbfa17e95e97e51cfa100515944c6f6f3da79130e0515d25e26f0f6` |
| `audio-STS-107.mp3` | https://archive.org/download/STS-107/STS-107_A-G_1-17-03_2000-2030.mp3 | 347766 | `9d13ea503b093dcbbc987d7d33620dee42a338dec57143bf00fc4bb94f1e6f9a` |
| `meta-13357AAP.json` | https://archive.org/metadata/13357AAP | 23209 | `682fb6b0518d70f542fe1cf08aec4c99898b08c667dca0b6555bc7b967db3f78` |
| `meta-Expedition26.json` | https://archive.org/metadata/Expedition26 | 3478 | `8b02bece5d35a162234a7761aa63feb4cc95366c32ff5382f019a03215ec9445` |
| `meta-JSC_ACR_Tape_Vault_DataBase1_Skylab-2.pdf.json` | https://archive.org/metadata/JSC_ACR_Tape_Vault_DataBase1_Skylab-2.pdf | 4094 | `9826f83feaa6c9ae52dd7eb42211fe3fcd9be446ecf5a2e5de674ea7bfe44606` |
| `meta-04-19-2022_CAPCOM-Call-Ax-1_Update.json` | https://archive.org/metadata/04-19-2022_CAPCOM-Call-Ax-1_Update | 3845 | `db9cbc81e7c7b299bc418c0378b7735d4e5293ee44dc99567db6b486320ad205` |
| `audio-04-19-2022_CAPCOM-Call-Ax-1_Update.mp3` | https://archive.org/download/04-19-2022_CAPCOM-Call-Ax-1_Update/04-19-2022_CAPCOM-Call-Ax-1_Update.mp3 | 517742 | `26c9cb38484fb829d539c06580d3dbfcdea907709c8b336b66b7ac1eedce5ebe` |
| `meta-11-30-2021_Space-to-Ground-Comm-to-Delay-EVA.json` | https://archive.org/metadata/11-30-2021_Space-to-Ground-Comm-to-Delay-EVA | 4471 | `ea19e7d1d1064f9d72108c79cbdf8728e86b778aab444a9d7ce240cddeafbefe` |
| `audio-11-30-2021_Space-to-Ground-Comm-to-Delay-EVA.mp3` | https://archive.org/download/11-30-2021_Space-to-Ground-Comm-to-Delay-EVA/0000000019_SYNC_SG2_2021-11-29_23_56_59_by_servername_desc.mp3 | 397114 | `0cce8116a8dda04b184da00e83be6c4fa546a2806b11090979983d16ef72baa3` |
| `meta-11-30-2021_Space-to-Ground-Comm-Go-for-EVA.json` | https://archive.org/metadata/11-30-2021_Space-to-Ground-Comm-Go-for-EVA | 4275 | `481ae80f443301fe31ed6cc349fbeea11dc3e8bcd0283361fa3a548b39d55998` |
| `meta-12-02-21_Space-to-Ground-Comm_PDAM-prep-conversation.json` | https://archive.org/metadata/12-02-21_Space-to-Ground-Comm_PDAM-prep-conversation | 4355 | `e7b395d511c8c052107ff9db3216bfedf2e5e8aeb199ad84625a6ebff816274c` |
| `audio-12-02-21_Space-to-Ground-Comm_PDAM-prep-conversation.mp3` | https://archive.org/download/12-02-21_Space-to-Ground-Comm_PDAM-prep-conversation/12-02-21_Space-to-Ground-Comm_PDAM-prep-conversation.mp3 | 1256733 | `acbea8c6fb59100dd965f34c3f136a5bf61cdb632976fbadce2bf22fb8595c41` |

## Processing

- The MP3 is the archive.org file itself, unchanged (no re-encoding); its SHA-256 equals the raw download above.
- Decoding: Chromium `decodeAudioData` on an `OfflineAudioContext` at the file's own sample rate (44100 Hz, read from the first frame header), so no resampling changes the samples. Decode at that rate in the page too.
- Clipped run: ≥ 3 consecutive sample frames with |x| ≥ 10^(-0.1/20) = 0.98855 in any channel (decoded MP3 samples may exceed 1).
- Silence: consecutive 50 ms windows whose RMS (loudest channel) is below -50 dBFS, lasting more than 2 s.

## Oracle

- Reference scan in Chromium (written separately from `answer.ts`): **12 clipped runs**, the longest 4 samples (0.1 ms) at sample 1546672; **5 silences** longer than 2 s; peak |x| 1.
- The generator also runs `answer.ts` (bundled with esbuild) on the same decode and stops unless it finds exactly these runs, silences and peak.
- Values with every run and silence span are in `recording.json`. `answer.test.ts` requires `clippedRuns >= 3` and at least one silence for the bundled file, and checks `answer.ts` on generated signals against a brute-force count; the page re-runs the reference scan on an `OfflineAudioContext` decode (M16c).

## Design reference

An Audacity / iZotope RX waveform editor: dark graphite `#1B1D1F`, a green waveform, amber clip marks, a compact toolbar with keycap hints, the system UI stack and system monospace timecodes.
