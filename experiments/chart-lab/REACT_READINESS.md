# Native React integration

The lab imports `Chart` from `snaplot/react`; its private lifecycle wrapper has been removed. React 19 and Solid 1.9 are the supported initial framework versions.

```tsx
import { useRef } from 'react';
import { Chart } from 'snaplot/react';
import type { ChartHandle } from 'snaplot';

function Telemetry({ data }: { data: { time: number; altitude: number }[] }) {
  const chart = useRef<ChartHandle<(typeof data)[number]>>(null);
  return <Chart ref={chart} data={data} x="time"
    series={[{ y: 'altitude' }]} ariaLabel="Flight altitude"
    axes={{ y: { title: 'Altitude (m)' } }} style={{ height: '280px' }} />;
}
```

Charts are constructed after commit and cleaned up on StrictMode replay and unmount. Ref changes do not replace the live chart. Complete prop snapshots reconcile atomically; omitted options reset, callbacks retain identity, and equivalent fresh objects do not reset navigation. Imperative `appendData` is available through the ref without forcing React renders.

State hooks use cached immutable snapshots through useSyncExternalStore. Controlled viewport, selectionState and hiddenSeries props emit proposed changes. Legend/table custom cells return React nodes; the Solid equivalents return Solid JSX and use signals and scoped effects.

Package consumer checks build and import actual core, React and Solid exports, check declarations, and server-render both frameworks. DOM lifecycle tests cover ownership and Solid hydration. The lab itself renders under StrictMode. Run `npm run test:consumers -w packages/snaplot` after `npm run build`.
