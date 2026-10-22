# Snaplot adapter

`SnaplotAdapter.tsx` passes application rows, named series fields, direct axis options and declarative reference lines to `Chart` from `snaplot/react`. The native integration owns lifecycle and updates. Visibility uses stable IDs through the controlled `hiddenSeries` prop.

The adapter retains the existing lab colors, line widths, point radii, reference-line styling and themes. The five scenarios and shared input rows are unchanged. No numeric column indices, conversion helper, serialized memo key or private wrapper is needed.

The original comparison findings remain in `../EVALUATION.md`. See `../REACT_READINESS.md` and `../ROW_API.md` for the implemented API.
