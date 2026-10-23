/**
 * The six examples (plan §10.2), listed on the homepage and the examples hub. M16 adds each page,
 * its Playwright thumbnail and its Open and Source links; the dataset lines follow each demo's
 * SOURCE.md under site/public/data/<slug>/.
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
}

export const DEMOS: readonly Demo[] = [
  {
    slug: 'ridgecrest-aftershocks',
    question: 'How fast did the Ridgecrest aftershocks die down?',
    framework: 'Vanilla JS',
    task: 'A geoscience student or journalist reads how quickly the daily rate fell.',
    dataset: 'U.S. Geological Survey, ANSS ComCat',
    licence: 'U.S. public domain',
  },
  {
    slug: 'central-park-summer',
    question: 'Was summer 2025 unusually hot in Central Park?',
    framework: 'Vanilla JS',
    task: 'A local reader or reporter judges how unusual each day was.',
    dataset: 'NOAA NCEI GHCN-Daily, doi:10.7289/V5D21VHZ',
    licence: 'U.S. Government work',
  },
  {
    slug: 'pick-a-checkpoint',
    question: 'Which checkpoint should we ship?',
    framework: 'React',
    task: 'An ML engineer compares a baseline run with a regularised run.',
    dataset: 'Training logs on the UCI Optical Recognition of Handwritten Digits',
    licence: 'CC BY 4.0',
  },
  {
    slug: 'battery-payback',
    question: 'Would a 5 kWh battery have paid for itself in this house?',
    framework: 'React',
    task: 'A homeowner with solar panels works out the payback from real usage.',
    dataset: 'Open Power System Data, Household Data 2020-04-15',
    licence: 'CC BY 4.0',
  },
  {
    slug: 'find-the-clipping',
    question: 'Where does this recording clip?',
    framework: 'Solid',
    task: 'A podcast editor finds clipped spans and long silences before publishing.',
    dataset: 'A NASA recording from the Internet Archive',
    licence: 'U.S. Government work',
  },
  {
    slug: 'deploy-482',
    question: 'Did deploy #482 cause the p99 spike?',
    framework: 'Solid',
    task: 'An on-call engineer decides whether to roll back.',
    dataset: 'A seeded service simulator',
    licence: 'Simulated',
  },
];
