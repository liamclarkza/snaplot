# Defaults, correction work and expected behavior

The success criterion is **a readable, useful chart from the obvious configuration**.
A polished demo is not a pass if its adapter has quietly fixed the chart for the
library. This report supersedes the broad layout recommendation in the first
[integration evaluation](EVALUATION.md).

Run `npm run dev:lab` and open the [defaults audit](http://127.0.0.1:4175/?audit=defaults).
It supplies semantic inputs and necessary container integration, with no custom
spacing, tick density, rotation, colors, legends or empty overlays. The separate
“Tuned dashboard adapter” setting exposes the additional configuration from the
first round. It uses the adapter alone, not the dashboard's external legend or
empty-state overlay.

## Reproduced Snaplot failures

Observed in the in-app browser on 17 September 2026. Widths below describe the
outer card; the chart host is two pixels narrower because of the card border.

| ID | Reproduction | Observed default | Required library behavior |
| --- | --- | --- | --- |
| DEF-01 | Long axis titles; 320×220 chart card | X title is about 440px wide in a 318px host; rotated Y title is about 497px high in a 220px host. Both are clipped. Y still clips at 480px width. | A deliberate title-fitting policy: wrap or ellipsize with accessible full text, with no manual padding or shortened application strings required. |
| DEF-02 | Long formatted ticks; 320×220 | “Window 0.0 seconds” and “Window 6.0 seconds” overlap by about 67px. A larger Y gutter leaves very little plot width. | Select ticks using their actual final positions and label boxes. Permit fewer labels when two cannot fit; protect useful plot area and handle insufficient space explicitly. |
| DEF-03 | Long category labels; 480×220 | Adjacent category labels overlap by roughly 9–15px. At 320px the chart shows fewer labels and avoids this particular collision. Making the card wider can therefore introduce crowding. | Category tick selection must use actual bar-center spacing, including domain edge padding, rather than infer spacing solely from plot width and label count. |
| DEF-04 | One observation; 320×220 | No visible data mark. The Y axis has only `20` at the bottom. Chart.js, Recharts and ECharts display the point in the same test. | A one-point line needs a visible marker or another clear point representation, without changing chart type. Give its auto domain a useful finite span. |
| DEF-05 | Constant readings; 320×220 | The series sits on the bottom frame; the Y axis has only `20`. Chart.js expands around the constant value. | Expand constant auto domains with a documented, scale-aware policy, including zero and negative constants. Respect explicitly pinned domains. |

The native defaults of the other libraries also fail some layout cases. They
are references for particular behaviors, not a lower bar Snaplot should accept:

- **Chart.js:** automatically rotates long ticks and gives a constant line a
  useful domain; a single observation has a marker. Very long axis titles are
  still problematic—the X title becomes compressed and the rotated Y title clips.
- **Recharts:** a minimal configuration with supplied axis titles needs spacing
  work even for the baseline labels. The initial tuned adapter hid that work.
  It displays the single observation, but constant data sits against an edge.
- **ECharts:** default axis names are end-positioned and can be clipped; long
  ticks overlap in this minimal configuration. Grid/axis-name choices matter.
  It displays a single point and a nonzero domain, but constant data still sits
  at the top edge in this fixture.

## Evidence and likely causes

- [Long titles, all four libraries](evidence/defaults-long-titles.png)
- [Long ticks, all four libraries](evidence/defaults-long-ticks.png)
- [Long category labels at 480px](evidence/defaults-category-labels-480.png)
- [Single observation](evidence/defaults-single-observation.png)
- [Constant readings](evidence/defaults-constant-readings.png)
- [DOM geometry audit](evidence/defaults-geometry.json): ten cases at 320px and
  480px, all at 220px chart height. This measures Snaplot label bounds only;
  absence of DOM failures is not a pass for canvas-rendered competitor text.

Source inspection supports the observations:

- `packages/snaplot/src/renderers/AxesRenderer.ts` emits titles as unbounded,
  non-wrapping DOM spans. `core/CanvasManager.ts` clips its layers. Title gutter
  thickness is reserved, but title length has no fitting policy.
- `AxesRenderer.ts` estimates horizontal spacing as `plot.width / (ticks.length - 1)`
  and forces at least two retained ticks. Actual category centers and clipped
  endpoints need not have that spacing. The final corner-adjustment pass also
  does not perform a general adjacent-label collision check.
- `renderers/LineRenderer.ts` returns immediately when there is at most one point.
- `core/Chart.ts` pads linear Y domains by a fraction of their range. A constant
  has zero range, so the default padding is also zero; `LinearScale` then maps
  that zero-width domain to its pixel minimum.

These are new, specific reproductions. Earlier 0.12 fixes for axis titles and
tick fitting were useful but did not cover every text length or geometry.
Follow-up: [visual refinements](VISUAL_REFINEMENT.md) change the core defaults.
DEF-05 now has a finite centered automatic domain, covered by regression tests;
the domain portion of DEF-04 is also fixed, but its missing marker remains.
The screenshots and geometry above record the original audit, not the revised
rendering. DEF-01 through DEF-03 remain open.

## Count the work the author had to do

The first lab concealed these responsibilities in a common adapter/shell. They
must be itemized when judging DX; total adapter lines are not a fair effort score.

| Responsibility | Where the first lab supplied it | How to evaluate it now |
| --- | --- | --- |
| Explicit chart height and grid shrink behavior | Shared CSS and wrapper | Count required layout declarations; distinguish normal card composition from compensating padding. Test hidden→visible and text changes next. |
| Tick density / label positioning | Snaplot tickCount=5; Recharts margins, title offsets and decade ticks; ECharts grid/name gaps | Keep native screenshots and record every correction separately. Re-test after changing text or width. |
| Numeric domains | Fixtures' fixed Y domains | Remove them for baseline tests; one-point and constant data must still work. |
| Labels and categories | Hand-authored labels and X formatter callbacks | Check defaults and visible representation; separately test each competitor's native categorical API before ranking category authoring. |
| Row conversion and series-column bookkeeping | Every adapter, particularly Snaplot's typed-column mapping | Count the concepts and synchronized edits needed to add, remove or reorder a field. |
| Legends, visibility and empty UI | Shared React shell | Credit these to the app, not the library. Evaluate an optional chart companion/default rather than assuming app glue is always the right answer. |
| Reference lines | Snaplot plugin factory; custom Chart.js plugin; Recharts ReferenceLine; ECharts markLine | Compare the code for the same one-line threshold, including subsequent updates and right-axis binding. |
| React lifecycle and identity | Imperative wrappers and memoization | Standard wrapper behavior should absorb routine ownership and teardown; users should not have to rediscover it. |

Use a correction ledger for subsequent fixes: **intent → minimal attempt → failure
→ workaround/diff → why needed → library remedy → regression fixture**. Record
actual attempts and doc lookups rather than inventing elapsed time or usability
scores. The native setup itself is developer-selected, not a blinded user study.

## Why the API feels clunky

The [API friction audit](API_FRICTION.md) gives eight before/after intent examples.
The recurring issue is that ordinary authoring exposes implementation details:

1. Callers think in fields but must build typed columns and synchronize numeric
   indices; line and scatter use partly different names for the same mapping.
2. A common threshold requires learning plugin construction and update lifetime.
3. Grouping involves configuration channels plus instance registration and cleanup;
   stable identity takes additional metadata/highlight configuration.
4. Categories, legends, empty UI and framework ownership require several pieces
   of app code that made the demo look simpler than the native experience.
5. Some APIs already do the expected thing but are hard to infer. For example,
   tooltip values already inherit axis formatting; adding another formatter alias
   is not automatically an improvement.

Prototype **one coherent higher-level authoring layer** with named `x`/`y` fields,
inferred labels and straightforward annotations, compiling into existing core
types. Retain the columnar path for callers who need allocation control. Avoid
making the API larger through a collection of overlapping aliases. The examples
in API_FRICTION.md are proposals, not new published exports.

## Priorities and acceptance gates

1. **Fix verified defaults first:** DEF-01 through DEF-05, with real-browser
   regressions. A fix should survive text/data/size changes without app overrides.
2. **Prototype the simple API against the same tasks:** start with object rows,
   add a series, change units, add a threshold, and update the dataset. Compare
   the number of concepts and coupled edits, not just character count.
3. **Close expected-behavior gaps:** [behavior audit](EXPECTED_BEHAVIOR.md). Separate
   existing-but-obscure functionality, missing convenient helpers, deliberate
   product exclusions and genuine render bugs. Reconsider exclusions such as
   categorical authoring when they conflict with the intended user experience.
4. **Run first-attempt exercises:** ask fresh implementers to attempt those tasks
   with editor types/completion first, then record where docs become necessary.
   The current source-informed audit has not measured real no-doc success rates.
5. **Carry the resulting semantics into React:** the new entrypoint should expose
   the simpler experience, not merely reproduce today's low-level ceremony.

Future layout acceptance should include short/long/localized titles and ticks,
wide numbers, units, both Y axes, narrow and shallow cards, resizing, changing
fonts and hidden→visible charts. When the requested content cannot physically
fit, success means a predictable readable fallback with recoverable full values,
not preserving every string at the expense of overlap or a zero-width plot.
