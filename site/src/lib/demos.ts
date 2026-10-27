/**
 * The six examples (plan §10.2), listed on the homepage and the examples hub. The dataset lines
 * follow each demo's SOURCE.md under site/public/data/<slug>/; the row counts are checked against
 * the data files by site/tests/examples/hub.spec.ts. A row links to its page once the page exists,
 * and shows its thumbnail (site/public/examples/<slug>.jpg, written by `npm run thumbs`) once that
 * exists.
 */
export interface Demo {
  slug: string;
  /** The title is the reader's question. */
  question: string;
  framework: 'Vanilla JS' | 'React' | 'Solid';
  /** Who decides what with it. */
  task: string;
  dataset: string;
  licence: string;
  /** How much data the page reads. */
  rows: string;
}

export const DEMOS: readonly Demo[] = [
  {
    slug: 'max-q',
    question: 'When does the rocket hit Max-Q?',
    framework: 'Vanilla JS',
    task: 'A launch fan or flight-dynamics student follows the ascent and its key moments.',
    dataset: 'A simulated two-stage launch to orbit',
    licence: 'Simulated',
    rows: '4,652 telemetry frames, generated in the browser',
  },
  {
    slug: 'hottest-year',
    question: 'Was 2024 the hottest year on record?',
    framework: 'Vanilla JS',
    task: 'A reader checks how 2024 compares with every year since 1940.',
    dataset: 'Copernicus C3S / ECMWF, ERA5 via Climate Pulse',
    licence: 'CC BY 4.0',
    rows: '31,710 days since 1940',
  },
  {
    slug: 'pick-a-checkpoint',
    question: 'Which checkpoint should we ship?',
    framework: 'React',
    task: 'An ML engineer compares a baseline run with a regularised run.',
    dataset: 'Training logs on the UCI Optical Recognition of Handwritten Digits',
    licence: 'CC BY 4.0',
    rows: '5,736 training and 120 validation rows',
  },
  {
    slug: 'battery-payback',
    question: 'Would a 5 kWh battery have paid for itself in this house?',
    framework: 'React',
    task: 'A homeowner with solar panels works out the payback from real usage.',
    dataset: 'Open Power System Data, Household Data 2020-04-15',
    licence: 'CC BY 4.0',
    rows: '8,760 hourly readings',
  },
  {
    slug: 'find-the-clipping',
    question: 'Where does this recording clip?',
    framework: 'Solid',
    task: 'A podcast editor finds clipped spans and long silences before publishing.',
    dataset: 'A NASA recording from the Internet Archive',
    licence: 'U.S. Government work',
    rows: '103 seconds of audio',
  },
  {
    slug: 'deploy-482',
    question: 'Did deploy #482 cause the p99 spike?',
    framework: 'Solid',
    task: 'An on-call engineer decides whether to roll back.',
    dataset: 'A seeded service simulator',
    licence: 'Simulated',
    rows: 'generated in the browser',
  },
];

/** Where each demo's code lives, for the Source links. */
export const sourceUrl = (slug: string): string =>
  `https://github.com/liamclarkza/snaplot/tree/main/site/src/demos/${slug}`;
