import { CSSProperties } from 'react';
import { DetailedReactHTMLElement } from 'react';
import { Property } from 'csstype';
import { ReactNode } from 'react';
import { Ref } from 'react';
import { RefObject } from 'react';

declare type Accessor<Row, Value> = Field<Row, Value> | ((row: Row, index: number) => Value);

declare interface AppendOptions {
    seriesId?: string;
    updateLast?: boolean;
}

/** Configuration for an axis entry in ChartConfig.axes */
declare interface AxisConfig {
    /** Scale kind for this axis. Default: `'linear'`. */
    type?: ScaleType;
    /**
     * Axis title rendered outside the tick labels: below a bottom axis,
     * rotated alongside a left/right axis. Layout reserves the extra gutter
     * space automatically.
     */
    label?: string;
    /** Fixed lower bound. Pinned, auto-range will restore to this value on reset. */
    min?: number;
    /** Fixed upper bound. Pinned, auto-range will restore to this value on reset. */
    max?: number;
    /**
     * Master switch for auto-range. When `false`, the scale keeps whatever
     * bounds it currently has (typically `min`/`max` or the last zoom).
     * Default: `true`.
     */
    auto?: boolean;
    /**
     * Fraction of the data range to pad on each side when auto-ranging.
     * `0` → exact extent, `0.05` → 5% on each side.
     * Default: `0` for horizontal axes, `0.05` for vertical axes.
     */
    padding?: number;
    /**
     * Whether to round auto-ranged bounds outward to clean 1/2/5 tick
     * boundaries. Linear continuous axes use this by default; set `nice: false`
     * to keep padded data bounds exact. Log axes remain opt-in with
     * `nice: true`, and time axes do not use this switch. Automatic linear bar
     * X axes use regular tick centers with half-interval outer grid cells;
     * `nice: false` retains category-edge padding. Histogram X bounds stay exact.
     */
    nice?: boolean;
    /**
     * Which side of the plot the axis renders on. Inferred from the axis key
     * when omitted (keys starting with `x` go bottom, others left), so set it
     * explicitly for a right-side or top axis.
     */
    position?: AxisPosition;
    /**
     * Custom tick label formatter. Overrides the scale's default formatting
     * for axis labels (including bar / histogram category labels). Return
     * the label as a string; return `''` to hide a specific tick.
     */
    tickFormat?: (value: number) => string;
    /**
     * Target tick density. Scales treat it as a hint (nice-number rounding
     * still applies on linear axes, including automatic bar grids). Default: 6.
     * Bar labels can thin independently of their slot-boundary grid. Histogram
     * and exact-bound bar category ticks treat it as a cap and also thin to fit
     * the plot width, so a year of daily bars does not label every day.
     */
    tickCount?: number;
    /**
     * Explicit tick values in data space. Overrides `tickCount` and the
     * scale's own generation; values outside the current domain are not
     * rendered. Gridlines follow these ticks, so this also controls the
     * grid density. Format labels with `tickFormat`.
     */
    ticks?: number[];
    /**
     * Gridline control for this axis. `false` hides this axis's gridlines
     * entirely; an object styles them. Default: solid hairlines in the
     * theme's grid color.
     */
    grid?: boolean | AxisGridConfig;
    /**
     * Short marks at axis grid positions. Continuous axes follow their visible
     * tick labels; automatic bar axes mark slot boundaries around center labels.
     * Default: `true`.
     */
    tickMarks?: boolean | AxisTickMarksConfig;
}

/**
 * Per-axis gridline styling, independent of tick labels. `false` (or
 * `show: false`) removes this axis's gridlines while its labels stay; a
 * time-bar chart often wants horizontal guides only, so set
 * `axes.x.grid: false`. Colors here are concrete CSS color strings; theme
 * `var()` references are resolved only in `ThemeConfig` fields.
 */
declare interface AxisGridConfig {
    /** Draw gridlines for this axis's ticks. Default: `true`. */
    show?: boolean;
    /** Gridline color. Default: the theme's `gridColor`. */
    color?: string;
    /** Gridline opacity. Default: derived from the theme's `gridOpacity`. */
    opacity?: number;
    /**
     * Canvas `setLineDash` pattern, e.g. `[4, 4]` for a dashed hairline.
     * Default: solid. Dashes shimmer slightly during pan (the pattern is
     * anchored in screen space), which is why solid is the default.
     */
    dash?: number[];
}

declare interface AxisOptions extends Omit<AxisConfig, 'type' | 'label' | 'nice' | 'padding' | 'tickFormat'> {
    type?: 'linear' | 'log' | 'time' | 'category';
    title?: string;
    roundBounds?: boolean;
    rangePadding?: number;
    /** Numbers include epoch milliseconds; category axes supply their labels. */
    format?(value: number | string): string;
    /** Authoritative category order, including slots without observations. */
    categories?: readonly string[];
}

declare type AxisPosition = 'top' | 'bottom' | 'left' | 'right';

/** Styling for the short marks that anchor tick labels to exact scale positions. */
declare interface AxisTickMarksConfig {
    /** Mark length in CSS pixels. Default: `4`. */
    length?: number;
    /** Which side of the plot border the mark extends toward. Default: `'out'`. */
    direction?: 'out' | 'in' | 'both';
    /** Mark color. Default: `theme.axisLineColor` at `theme.gridOpacity`. An explicit color is opaque. */
    color?: string;
}

declare type AxisValue = number | Date | string;

/** Native React 19 component. Options are direct props; the ref exposes the imperative handle. */
export declare function Chart<Row = Record<string, unknown>>(props: ChartProps<Row>): DetailedReactHTMLElement<    {
ref: RefObject<HTMLDivElement | null>;
className: string | undefined;
style: {
accentColor?: Property.AccentColor | undefined;
alignContent?: Property.AlignContent | undefined;
alignItems?: Property.AlignItems | undefined;
alignSelf?: Property.AlignSelf | undefined;
alignTracks?: Property.AlignTracks | undefined;
alignmentBaseline?: Property.AlignmentBaseline | undefined;
anchorName?: Property.AnchorName | undefined;
anchorScope?: Property.AnchorScope | undefined;
animationComposition?: Property.AnimationComposition | undefined;
animationDelay?: Property.AnimationDelay<string & {}> | undefined;
animationDirection?: Property.AnimationDirection | undefined;
animationDuration?: Property.AnimationDuration<string & {}> | undefined;
animationFillMode?: Property.AnimationFillMode | undefined;
animationIterationCount?: Property.AnimationIterationCount | undefined;
animationName?: Property.AnimationName | undefined;
animationPlayState?: Property.AnimationPlayState | undefined;
animationRangeEnd?: Property.AnimationRangeEnd<string | number> | undefined;
animationRangeStart?: Property.AnimationRangeStart<string | number> | undefined;
animationTimeline?: Property.AnimationTimeline | undefined;
animationTimingFunction?: Property.AnimationTimingFunction | undefined;
appearance?: Property.Appearance | undefined;
aspectRatio?: Property.AspectRatio | undefined;
backdropFilter?: Property.BackdropFilter | undefined;
backfaceVisibility?: Property.BackfaceVisibility | undefined;
backgroundAttachment?: Property.BackgroundAttachment | undefined;
backgroundBlendMode?: Property.BackgroundBlendMode | undefined;
backgroundClip?: Property.BackgroundClip | undefined;
backgroundColor?: Property.BackgroundColor | undefined;
backgroundImage?: Property.BackgroundImage | undefined;
backgroundOrigin?: Property.BackgroundOrigin | undefined;
backgroundPositionX?: Property.BackgroundPositionX<string | number> | undefined;
backgroundPositionY?: Property.BackgroundPositionY<string | number> | undefined;
backgroundRepeat?: Property.BackgroundRepeat | undefined;
backgroundSize?: Property.BackgroundSize<string | number> | undefined;
baselineShift?: Property.BaselineShift<string | number> | undefined;
blockSize?: Property.BlockSize<string | number> | undefined;
borderBlockEndColor?: Property.BorderBlockEndColor | undefined;
borderBlockEndStyle?: Property.BorderBlockEndStyle | undefined;
borderBlockEndWidth?: Property.BorderBlockEndWidth<string | number> | undefined;
borderBlockStartColor?: Property.BorderBlockStartColor | undefined;
borderBlockStartStyle?: Property.BorderBlockStartStyle | undefined;
borderBlockStartWidth?: Property.BorderBlockStartWidth<string | number> | undefined;
borderBottomColor?: Property.BorderBottomColor | undefined;
borderBottomLeftRadius?: Property.BorderBottomLeftRadius<string | number> | undefined;
borderBottomRightRadius?: Property.BorderBottomRightRadius<string | number> | undefined;
borderBottomStyle?: Property.BorderBottomStyle | undefined;
borderBottomWidth?: Property.BorderBottomWidth<string | number> | undefined;
borderCollapse?: Property.BorderCollapse | undefined;
borderEndEndRadius?: Property.BorderEndEndRadius<string | number> | undefined;
borderEndStartRadius?: Property.BorderEndStartRadius<string | number> | undefined;
borderImageOutset?: Property.BorderImageOutset<string | number> | undefined;
borderImageRepeat?: Property.BorderImageRepeat | undefined;
borderImageSlice?: Property.BorderImageSlice | undefined;
borderImageSource?: Property.BorderImageSource | undefined;
borderImageWidth?: Property.BorderImageWidth<string | number> | undefined;
borderInlineEndColor?: Property.BorderInlineEndColor | undefined;
borderInlineEndStyle?: Property.BorderInlineEndStyle | undefined;
borderInlineEndWidth?: Property.BorderInlineEndWidth<string | number> | undefined;
borderInlineStartColor?: Property.BorderInlineStartColor | undefined;
borderInlineStartStyle?: Property.BorderInlineStartStyle | undefined;
borderInlineStartWidth?: Property.BorderInlineStartWidth<string | number> | undefined;
borderLeftColor?: Property.BorderLeftColor | undefined;
borderLeftStyle?: Property.BorderLeftStyle | undefined;
borderLeftWidth?: Property.BorderLeftWidth<string | number> | undefined;
borderRightColor?: Property.BorderRightColor | undefined;
borderRightStyle?: Property.BorderRightStyle | undefined;
borderRightWidth?: Property.BorderRightWidth<string | number> | undefined;
borderSpacing?: Property.BorderSpacing<string | number> | undefined;
borderStartEndRadius?: Property.BorderStartEndRadius<string | number> | undefined;
borderStartStartRadius?: Property.BorderStartStartRadius<string | number> | undefined;
borderTopColor?: Property.BorderTopColor | undefined;
borderTopLeftRadius?: Property.BorderTopLeftRadius<string | number> | undefined;
borderTopRightRadius?: Property.BorderTopRightRadius<string | number> | undefined;
borderTopStyle?: Property.BorderTopStyle | undefined;
borderTopWidth?: Property.BorderTopWidth<string | number> | undefined;
bottom?: Property.Bottom<string | number> | undefined;
boxDecorationBreak?: Property.BoxDecorationBreak | undefined;
boxShadow?: Property.BoxShadow | undefined;
boxSizing?: Property.BoxSizing | undefined;
breakAfter?: Property.BreakAfter | undefined;
breakBefore?: Property.BreakBefore | undefined;
breakInside?: Property.BreakInside | undefined;
captionSide?: Property.CaptionSide | undefined;
caretColor?: Property.CaretColor | undefined;
caretShape?: Property.CaretShape | undefined;
clear?: Property.Clear | undefined;
clipPath?: Property.ClipPath | undefined;
clipRule?: Property.ClipRule | undefined;
color?: Property.Color | undefined;
colorAdjust?: Property.PrintColorAdjust | undefined;
colorInterpolationFilters?: Property.ColorInterpolationFilters | undefined;
colorScheme?: Property.ColorScheme | undefined;
columnCount?: Property.ColumnCount | undefined;
columnFill?: Property.ColumnFill | undefined;
columnGap?: Property.ColumnGap<string | number> | undefined;
columnRuleColor?: Property.ColumnRuleColor | undefined;
columnRuleStyle?: Property.ColumnRuleStyle | undefined;
columnRuleWidth?: Property.ColumnRuleWidth<string | number> | undefined;
columnSpan?: Property.ColumnSpan | undefined;
columnWidth?: Property.ColumnWidth<string | number> | undefined;
contain?: Property.Contain | undefined;
containIntrinsicBlockSize?: Property.ContainIntrinsicBlockSize<string | number> | undefined;
containIntrinsicHeight?: Property.ContainIntrinsicHeight<string | number> | undefined;
containIntrinsicInlineSize?: Property.ContainIntrinsicInlineSize<string | number> | undefined;
containIntrinsicWidth?: Property.ContainIntrinsicWidth<string | number> | undefined;
containerName?: Property.ContainerName | undefined;
containerType?: Property.ContainerType | undefined;
content?: Property.Content | undefined;
contentVisibility?: Property.ContentVisibility | undefined;
counterIncrement?: Property.CounterIncrement | undefined;
counterReset?: Property.CounterReset | undefined;
counterSet?: Property.CounterSet | undefined;
cursor?: Property.Cursor | undefined;
cx?: Property.Cx<string | number> | undefined;
cy?: Property.Cy<string | number> | undefined;
d?: Property.D | undefined;
direction?: Property.Direction | undefined;
display?: Property.Display | undefined;
dominantBaseline?: Property.DominantBaseline | undefined;
emptyCells?: Property.EmptyCells | undefined;
fieldSizing?: Property.FieldSizing | undefined;
fill?: Property.Fill | undefined;
fillOpacity?: Property.FillOpacity | undefined;
fillRule?: Property.FillRule | undefined;
filter?: Property.Filter | undefined;
flexBasis?: Property.FlexBasis<string | number> | undefined;
flexDirection?: Property.FlexDirection | undefined;
flexGrow?: Property.FlexGrow | undefined;
flexShrink?: Property.FlexShrink | undefined;
flexWrap?: Property.FlexWrap | undefined;
float?: Property.Float | undefined;
floodColor?: Property.FloodColor | undefined;
floodOpacity?: Property.FloodOpacity | undefined;
fontFamily?: Property.FontFamily | undefined;
fontFeatureSettings?: Property.FontFeatureSettings | undefined;
fontKerning?: Property.FontKerning | undefined;
fontLanguageOverride?: Property.FontLanguageOverride | undefined;
fontOpticalSizing?: Property.FontOpticalSizing | undefined;
fontPalette?: Property.FontPalette | undefined;
fontSize?: Property.FontSize<string | number> | undefined;
fontSizeAdjust?: Property.FontSizeAdjust | undefined;
fontSmooth?: Property.FontSmooth<string | number> | undefined;
fontStyle?: Property.FontStyle | undefined;
fontSynthesis?: Property.FontSynthesis | undefined;
fontSynthesisPosition?: Property.FontSynthesisPosition | undefined;
fontSynthesisSmallCaps?: Property.FontSynthesisSmallCaps | undefined;
fontSynthesisStyle?: Property.FontSynthesisStyle | undefined;
fontSynthesisWeight?: Property.FontSynthesisWeight | undefined;
fontVariant?: Property.FontVariant | undefined;
fontVariantAlternates?: Property.FontVariantAlternates | undefined;
fontVariantCaps?: Property.FontVariantCaps | undefined;
fontVariantEastAsian?: Property.FontVariantEastAsian | undefined;
fontVariantEmoji?: Property.FontVariantEmoji | undefined;
fontVariantLigatures?: Property.FontVariantLigatures | undefined;
fontVariantNumeric?: Property.FontVariantNumeric | undefined;
fontVariantPosition?: Property.FontVariantPosition | undefined;
fontVariationSettings?: Property.FontVariationSettings | undefined;
fontWeight?: Property.FontWeight | undefined;
fontWidth?: Property.FontWidth | undefined;
forcedColorAdjust?: Property.ForcedColorAdjust | undefined;
gridAutoColumns?: Property.GridAutoColumns<string | number> | undefined;
gridAutoFlow?: Property.GridAutoFlow | undefined;
gridAutoRows?: Property.GridAutoRows<string | number> | undefined;
gridColumnEnd?: Property.GridColumnEnd | undefined;
gridColumnStart?: Property.GridColumnStart | undefined;
gridRowEnd?: Property.GridRowEnd | undefined;
gridRowStart?: Property.GridRowStart | undefined;
gridTemplateAreas?: Property.GridTemplateAreas | undefined;
gridTemplateColumns?: Property.GridTemplateColumns<string | number> | undefined;
gridTemplateRows?: Property.GridTemplateRows<string | number> | undefined;
hangingPunctuation?: Property.HangingPunctuation | undefined;
height: Property.Height<string | number>;
hyphenateCharacter?: Property.HyphenateCharacter | undefined;
hyphenateLimitChars?: Property.HyphenateLimitChars | undefined;
hyphens?: Property.Hyphens | undefined;
imageOrientation?: Property.ImageOrientation | undefined;
imageRendering?: Property.ImageRendering | undefined;
imageResolution?: Property.ImageResolution | undefined;
initialLetter?: Property.InitialLetter | undefined;
initialLetterAlign?: Property.InitialLetterAlign | undefined;
inlineSize?: Property.InlineSize<string | number> | undefined;
insetBlockEnd?: Property.InsetBlockEnd<string | number> | undefined;
insetBlockStart?: Property.InsetBlockStart<string | number> | undefined;
insetInlineEnd?: Property.InsetInlineEnd<string | number> | undefined;
insetInlineStart?: Property.InsetInlineStart<string | number> | undefined;
interpolateSize?: Property.InterpolateSize | undefined;
isolation?: Property.Isolation | undefined;
justifyContent?: Property.JustifyContent | undefined;
justifyItems?: Property.JustifyItems | undefined;
justifySelf?: Property.JustifySelf | undefined;
justifyTracks?: Property.JustifyTracks | undefined;
left?: Property.Left<string | number> | undefined;
letterSpacing?: Property.LetterSpacing<string | number> | undefined;
lightingColor?: Property.LightingColor | undefined;
lineBreak?: Property.LineBreak | undefined;
lineHeight?: Property.LineHeight<string | number> | undefined;
lineHeightStep?: Property.LineHeightStep<string | number> | undefined;
listStyleImage?: Property.ListStyleImage | undefined;
listStylePosition?: Property.ListStylePosition | undefined;
listStyleType?: Property.ListStyleType | undefined;
marginBlockEnd?: Property.MarginBlockEnd<string | number> | undefined;
marginBlockStart?: Property.MarginBlockStart<string | number> | undefined;
marginBottom?: Property.MarginBottom<string | number> | undefined;
marginInlineEnd?: Property.MarginInlineEnd<string | number> | undefined;
marginInlineStart?: Property.MarginInlineStart<string | number> | undefined;
marginLeft?: Property.MarginLeft<string | number> | undefined;
marginRight?: Property.MarginRight<string | number> | undefined;
marginTop?: Property.MarginTop<string | number> | undefined;
marginTrim?: Property.MarginTrim | undefined;
marker?: Property.Marker | undefined;
markerEnd?: Property.MarkerEnd | undefined;
markerMid?: Property.MarkerMid | undefined;
markerStart?: Property.MarkerStart | undefined;
maskBorderMode?: Property.MaskBorderMode | undefined;
maskBorderOutset?: Property.MaskBorderOutset<string | number> | undefined;
maskBorderRepeat?: Property.MaskBorderRepeat | undefined;
maskBorderSlice?: Property.MaskBorderSlice | undefined;
maskBorderSource?: Property.MaskBorderSource | undefined;
maskBorderWidth?: Property.MaskBorderWidth<string | number> | undefined;
maskClip?: Property.MaskClip | undefined;
maskComposite?: Property.MaskComposite | undefined;
maskImage?: Property.MaskImage | undefined;
maskMode?: Property.MaskMode | undefined;
maskOrigin?: Property.MaskOrigin | undefined;
maskPosition?: Property.MaskPosition<string | number> | undefined;
maskRepeat?: Property.MaskRepeat | undefined;
maskSize?: Property.MaskSize<string | number> | undefined;
maskType?: Property.MaskType | undefined;
masonryAutoFlow?: Property.MasonryAutoFlow | undefined;
mathDepth?: Property.MathDepth | undefined;
mathShift?: Property.MathShift | undefined;
mathStyle?: Property.MathStyle | undefined;
maxBlockSize?: Property.MaxBlockSize<string | number> | undefined;
maxHeight?: Property.MaxHeight<string | number> | undefined;
maxInlineSize?: Property.MaxInlineSize<string | number> | undefined;
maxLines?: Property.MaxLines | undefined;
maxWidth?: Property.MaxWidth<string | number> | undefined;
minBlockSize?: Property.MinBlockSize<string | number> | undefined;
minHeight?: Property.MinHeight<string | number> | undefined;
minInlineSize?: Property.MinInlineSize<string | number> | undefined;
minWidth?: Property.MinWidth<string | number> | undefined;
mixBlendMode?: Property.MixBlendMode | undefined;
motionDistance?: Property.OffsetDistance<string | number> | undefined;
motionPath?: Property.OffsetPath | undefined;
motionRotation?: Property.OffsetRotate | undefined;
objectFit?: Property.ObjectFit | undefined;
objectPosition?: Property.ObjectPosition<string | number> | undefined;
objectViewBox?: Property.ObjectViewBox | undefined;
offsetAnchor?: Property.OffsetAnchor<string | number> | undefined;
offsetDistance?: Property.OffsetDistance<string | number> | undefined;
offsetPath?: Property.OffsetPath | undefined;
offsetPosition?: Property.OffsetPosition<string | number> | undefined;
offsetRotate?: Property.OffsetRotate | undefined;
offsetRotation?: Property.OffsetRotate | undefined;
opacity?: Property.Opacity | undefined;
order?: Property.Order | undefined;
orphans?: Property.Orphans | undefined;
outlineColor?: Property.OutlineColor | undefined;
outlineOffset?: Property.OutlineOffset<string | number> | undefined;
outlineStyle?: Property.OutlineStyle | undefined;
outlineWidth?: Property.OutlineWidth<string | number> | undefined;
overflowAnchor?: Property.OverflowAnchor | undefined;
overflowBlock?: Property.OverflowBlock | undefined;
overflowClipBox?: Property.OverflowClipBox | undefined;
overflowClipMargin?: Property.OverflowClipMargin<string | number> | undefined;
overflowInline?: Property.OverflowInline | undefined;
overflowWrap?: Property.OverflowWrap | undefined;
overflowX?: Property.OverflowX | undefined;
overflowY?: Property.OverflowY | undefined;
overlay?: Property.Overlay | undefined;
overscrollBehaviorBlock?: Property.OverscrollBehaviorBlock | undefined;
overscrollBehaviorInline?: Property.OverscrollBehaviorInline | undefined;
overscrollBehaviorX?: Property.OverscrollBehaviorX | undefined;
overscrollBehaviorY?: Property.OverscrollBehaviorY | undefined;
paddingBlockEnd?: Property.PaddingBlockEnd<string | number> | undefined;
paddingBlockStart?: Property.PaddingBlockStart<string | number> | undefined;
paddingBottom?: Property.PaddingBottom<string | number> | undefined;
paddingInlineEnd?: Property.PaddingInlineEnd<string | number> | undefined;
paddingInlineStart?: Property.PaddingInlineStart<string | number> | undefined;
paddingLeft?: Property.PaddingLeft<string | number> | undefined;
paddingRight?: Property.PaddingRight<string | number> | undefined;
paddingTop?: Property.PaddingTop<string | number> | undefined;
page?: Property.Page | undefined;
paintOrder?: Property.PaintOrder | undefined;
perspective?: Property.Perspective<string | number> | undefined;
perspectiveOrigin?: Property.PerspectiveOrigin<string | number> | undefined;
pointerEvents?: Property.PointerEvents | undefined;
position?: Property.Position | undefined;
positionAnchor?: Property.PositionAnchor | undefined;
positionArea?: Property.PositionArea | undefined;
positionTryFallbacks?: Property.PositionTryFallbacks | undefined;
positionTryOrder?: Property.PositionTryOrder | undefined;
positionVisibility?: Property.PositionVisibility | undefined;
printColorAdjust?: Property.PrintColorAdjust | undefined;
quotes?: Property.Quotes | undefined;
r?: Property.R<string | number> | undefined;
resize?: Property.Resize | undefined;
right?: Property.Right<string | number> | undefined;
rotate?: Property.Rotate | undefined;
rowGap?: Property.RowGap<string | number> | undefined;
rubyAlign?: Property.RubyAlign | undefined;
rubyMerge?: Property.RubyMerge | undefined;
rubyOverhang?: Property.RubyOverhang | undefined;
rubyPosition?: Property.RubyPosition | undefined;
rx?: Property.Rx<string | number> | undefined;
ry?: Property.Ry<string | number> | undefined;
scale?: Property.Scale | undefined;
scrollBehavior?: Property.ScrollBehavior | undefined;
scrollInitialTarget?: Property.ScrollInitialTarget | undefined;
scrollMarginBlockEnd?: Property.ScrollMarginBlockEnd<string | number> | undefined;
scrollMarginBlockStart?: Property.ScrollMarginBlockStart<string | number> | undefined;
scrollMarginBottom?: Property.ScrollMarginBottom<string | number> | undefined;
scrollMarginInlineEnd?: Property.ScrollMarginInlineEnd<string | number> | undefined;
scrollMarginInlineStart?: Property.ScrollMarginInlineStart<string | number> | undefined;
scrollMarginLeft?: Property.ScrollMarginLeft<string | number> | undefined;
scrollMarginRight?: Property.ScrollMarginRight<string | number> | undefined;
scrollMarginTop?: Property.ScrollMarginTop<string | number> | undefined;
scrollPaddingBlockEnd?: Property.ScrollPaddingBlockEnd<string | number> | undefined;
scrollPaddingBlockStart?: Property.ScrollPaddingBlockStart<string | number> | undefined;
scrollPaddingBottom?: Property.ScrollPaddingBottom<string | number> | undefined;
scrollPaddingInlineEnd?: Property.ScrollPaddingInlineEnd<string | number> | undefined;
scrollPaddingInlineStart?: Property.ScrollPaddingInlineStart<string | number> | undefined;
scrollPaddingLeft?: Property.ScrollPaddingLeft<string | number> | undefined;
scrollPaddingRight?: Property.ScrollPaddingRight<string | number> | undefined;
scrollPaddingTop?: Property.ScrollPaddingTop<string | number> | undefined;
scrollSnapAlign?: Property.ScrollSnapAlign | undefined;
scrollSnapMarginBottom?: Property.ScrollMarginBottom<string | number> | undefined;
scrollSnapMarginLeft?: Property.ScrollMarginLeft<string | number> | undefined;
scrollSnapMarginRight?: Property.ScrollMarginRight<string | number> | undefined;
scrollSnapMarginTop?: Property.ScrollMarginTop<string | number> | undefined;
scrollSnapStop?: Property.ScrollSnapStop | undefined;
scrollSnapType?: Property.ScrollSnapType | undefined;
scrollTimelineAxis?: Property.ScrollTimelineAxis | undefined;
scrollTimelineName?: Property.ScrollTimelineName | undefined;
scrollbarColor?: Property.ScrollbarColor | undefined;
scrollbarGutter?: Property.ScrollbarGutter | undefined;
scrollbarWidth?: Property.ScrollbarWidth | undefined;
shapeImageThreshold?: Property.ShapeImageThreshold | undefined;
shapeMargin?: Property.ShapeMargin<string | number> | undefined;
shapeOutside?: Property.ShapeOutside | undefined;
shapeRendering?: Property.ShapeRendering | undefined;
speakAs?: Property.SpeakAs | undefined;
stopColor?: Property.StopColor | undefined;
stopOpacity?: Property.StopOpacity | undefined;
stroke?: Property.Stroke | undefined;
strokeColor?: Property.StrokeColor | undefined;
strokeDasharray?: Property.StrokeDasharray<string | number> | undefined;
strokeDashoffset?: Property.StrokeDashoffset<string | number> | undefined;
strokeLinecap?: Property.StrokeLinecap | undefined;
strokeLinejoin?: Property.StrokeLinejoin | undefined;
strokeMiterlimit?: Property.StrokeMiterlimit | undefined;
strokeOpacity?: Property.StrokeOpacity | undefined;
strokeWidth?: Property.StrokeWidth<string | number> | undefined;
tabSize?: Property.TabSize<string | number> | undefined;
tableLayout?: Property.TableLayout | undefined;
textAlign?: Property.TextAlign | undefined;
textAlignLast?: Property.TextAlignLast | undefined;
textAnchor?: Property.TextAnchor | undefined;
textAutospace?: Property.TextAutospace | undefined;
textBox?: Property.TextBox | undefined;
textBoxEdge?: Property.TextBoxEdge | undefined;
textBoxTrim?: Property.TextBoxTrim | undefined;
textCombineUpright?: Property.TextCombineUpright | undefined;
textDecorationColor?: Property.TextDecorationColor | undefined;
textDecorationLine?: Property.TextDecorationLine | undefined;
textDecorationSkip?: Property.TextDecorationSkip | undefined;
textDecorationSkipInk?: Property.TextDecorationSkipInk | undefined;
textDecorationStyle?: Property.TextDecorationStyle | undefined;
textDecorationThickness?: Property.TextDecorationThickness<string | number> | undefined;
textEmphasisColor?: Property.TextEmphasisColor | undefined;
textEmphasisPosition?: Property.TextEmphasisPosition | undefined;
textEmphasisStyle?: Property.TextEmphasisStyle | undefined;
textIndent?: Property.TextIndent<string | number> | undefined;
textJustify?: Property.TextJustify | undefined;
textOrientation?: Property.TextOrientation | undefined;
textOverflow?: Property.TextOverflow | undefined;
textRendering?: Property.TextRendering | undefined;
textShadow?: Property.TextShadow | undefined;
textSizeAdjust?: Property.TextSizeAdjust | undefined;
textSpacingTrim?: Property.TextSpacingTrim | undefined;
textTransform?: Property.TextTransform | undefined;
textUnderlineOffset?: Property.TextUnderlineOffset<string | number> | undefined;
textUnderlinePosition?: Property.TextUnderlinePosition | undefined;
textWrapMode?: Property.TextWrapMode | undefined;
textWrapStyle?: Property.TextWrapStyle | undefined;
timelineScope?: Property.TimelineScope | undefined;
top?: Property.Top<string | number> | undefined;
touchAction?: Property.TouchAction | undefined;
transform?: Property.Transform | undefined;
transformBox?: Property.TransformBox | undefined;
transformOrigin?: Property.TransformOrigin<string | number> | undefined;
transformStyle?: Property.TransformStyle | undefined;
transitionBehavior?: Property.TransitionBehavior | undefined;
transitionDelay?: Property.TransitionDelay<string & {}> | undefined;
transitionDuration?: Property.TransitionDuration<string & {}> | undefined;
transitionProperty?: Property.TransitionProperty | undefined;
transitionTimingFunction?: Property.TransitionTimingFunction | undefined;
translate?: Property.Translate<string | number> | undefined;
unicodeBidi?: Property.UnicodeBidi | undefined;
userSelect?: Property.UserSelect | undefined;
vectorEffect?: Property.VectorEffect | undefined;
verticalAlign?: Property.VerticalAlign<string | number> | undefined;
viewTimelineAxis?: Property.ViewTimelineAxis | undefined;
viewTimelineInset?: Property.ViewTimelineInset<string | number> | undefined;
viewTimelineName?: Property.ViewTimelineName | undefined;
viewTransitionClass?: Property.ViewTransitionClass | undefined;
viewTransitionName?: Property.ViewTransitionName | undefined;
visibility?: Property.Visibility | undefined;
whiteSpace?: Property.WhiteSpace | undefined;
whiteSpaceCollapse?: Property.WhiteSpaceCollapse | undefined;
widows?: Property.Widows | undefined;
width: Property.Width<string | number>;
willChange?: Property.WillChange | undefined;
wordBreak?: Property.WordBreak | undefined;
wordSpacing?: Property.WordSpacing<string | number> | undefined;
wordWrap?: Property.WordWrap | undefined;
writingMode?: Property.WritingMode | undefined;
x?: Property.X<string | number> | undefined;
y?: Property.Y<string | number> | undefined;
zIndex?: Property.ZIndex | undefined;
zoom?: Property.Zoom | undefined;
all?: Property.All | undefined;
animation?: Property.Animation<string & {}> | undefined;
animationRange?: Property.AnimationRange<string | number> | undefined;
background?: Property.Background<string | number> | undefined;
backgroundPosition?: Property.BackgroundPosition<string | number> | undefined;
border?: Property.Border<string | number> | undefined;
borderBlock?: Property.BorderBlock<string | number> | undefined;
borderBlockColor?: Property.BorderBlockColor | undefined;
borderBlockEnd?: Property.BorderBlockEnd<string | number> | undefined;
borderBlockStart?: Property.BorderBlockStart<string | number> | undefined;
borderBlockStyle?: Property.BorderBlockStyle | undefined;
borderBlockWidth?: Property.BorderBlockWidth<string | number> | undefined;
borderBottom?: Property.BorderBottom<string | number> | undefined;
borderColor?: Property.BorderColor | undefined;
borderImage?: Property.BorderImage | undefined;
borderInline?: Property.BorderInline<string | number> | undefined;
borderInlineColor?: Property.BorderInlineColor | undefined;
borderInlineEnd?: Property.BorderInlineEnd<string | number> | undefined;
borderInlineStart?: Property.BorderInlineStart<string | number> | undefined;
borderInlineStyle?: Property.BorderInlineStyle | undefined;
borderInlineWidth?: Property.BorderInlineWidth<string | number> | undefined;
borderLeft?: Property.BorderLeft<string | number> | undefined;
borderRadius?: Property.BorderRadius<string | number> | undefined;
borderRight?: Property.BorderRight<string | number> | undefined;
borderStyle?: Property.BorderStyle | undefined;
borderTop?: Property.BorderTop<string | number> | undefined;
borderWidth?: Property.BorderWidth<string | number> | undefined;
caret?: Property.Caret | undefined;
columnRule?: Property.ColumnRule<string | number> | undefined;
columns?: Property.Columns<string | number> | undefined;
containIntrinsicSize?: Property.ContainIntrinsicSize<string | number> | undefined;
container?: Property.Container | undefined;
flex?: Property.Flex<string | number> | undefined;
flexFlow?: Property.FlexFlow | undefined;
font?: Property.Font | undefined;
gap?: Property.Gap<string | number> | undefined;
grid?: Property.Grid | undefined;
gridArea?: Property.GridArea | undefined;
gridColumn?: Property.GridColumn | undefined;
gridRow?: Property.GridRow | undefined;
gridTemplate?: Property.GridTemplate | undefined;
inset?: Property.Inset<string | number> | undefined;
insetBlock?: Property.InsetBlock<string | number> | undefined;
insetInline?: Property.InsetInline<string | number> | undefined;
lineClamp?: Property.LineClamp | undefined;
listStyle?: Property.ListStyle | undefined;
margin?: Property.Margin<string | number> | undefined;
marginBlock?: Property.MarginBlock<string | number> | undefined;
marginInline?: Property.MarginInline<string | number> | undefined;
mask?: Property.Mask<string | number> | undefined;
maskBorder?: Property.MaskBorder | undefined;
motion?: Property.Offset<string | number> | undefined;
offset?: Property.Offset<string | number> | undefined;
outline?: Property.Outline<string | number> | undefined;
overflow?: Property.Overflow | undefined;
overscrollBehavior?: Property.OverscrollBehavior | undefined;
padding?: Property.Padding<string | number> | undefined;
paddingBlock?: Property.PaddingBlock<string | number> | undefined;
paddingInline?: Property.PaddingInline<string | number> | undefined;
placeContent?: Property.PlaceContent | undefined;
placeItems?: Property.PlaceItems | undefined;
placeSelf?: Property.PlaceSelf | undefined;
positionTry?: Property.PositionTry | undefined;
scrollMargin?: Property.ScrollMargin<string | number> | undefined;
scrollMarginBlock?: Property.ScrollMarginBlock<string | number> | undefined;
scrollMarginInline?: Property.ScrollMarginInline<string | number> | undefined;
scrollPadding?: Property.ScrollPadding<string | number> | undefined;
scrollPaddingBlock?: Property.ScrollPaddingBlock<string | number> | undefined;
scrollPaddingInline?: Property.ScrollPaddingInline<string | number> | undefined;
scrollSnapMargin?: Property.ScrollMargin<string | number> | undefined;
scrollTimeline?: Property.ScrollTimeline | undefined;
textDecoration?: Property.TextDecoration<string | number> | undefined;
textEmphasis?: Property.TextEmphasis | undefined;
textWrap?: Property.TextWrap | undefined;
transition?: Property.Transition<string & {}> | undefined;
viewTimeline?: Property.ViewTimeline | undefined;
MozAnimationDelay?: Property.AnimationDelay<string & {}> | undefined;
MozAnimationDirection?: Property.AnimationDirection | undefined;
MozAnimationDuration?: Property.AnimationDuration<string & {}> | undefined;
MozAnimationFillMode?: Property.AnimationFillMode | undefined;
MozAnimationIterationCount?: Property.AnimationIterationCount | undefined;
MozAnimationName?: Property.AnimationName | undefined;
MozAnimationPlayState?: Property.AnimationPlayState | undefined;
MozAnimationTimingFunction?: Property.AnimationTimingFunction | undefined;
MozAppearance?: Property.MozAppearance | undefined;
MozBackfaceVisibility?: Property.BackfaceVisibility | undefined;
MozBinding?: Property.MozBinding | undefined;
MozBorderBottomColors?: Property.MozBorderBottomColors | undefined;
MozBorderEndColor?: Property.BorderInlineEndColor | undefined;
MozBorderEndStyle?: Property.BorderInlineEndStyle | undefined;
MozBorderEndWidth?: Property.BorderInlineEndWidth<string | number> | undefined;
MozBorderLeftColors?: Property.MozBorderLeftColors | undefined;
MozBorderRightColors?: Property.MozBorderRightColors | undefined;
MozBorderStartColor?: Property.BorderInlineStartColor | undefined;
MozBorderStartStyle?: Property.BorderInlineStartStyle | undefined;
MozBorderTopColors?: Property.MozBorderTopColors | undefined;
MozBoxSizing?: Property.BoxSizing | undefined;
MozColumnRuleColor?: Property.ColumnRuleColor | undefined;
MozColumnRuleStyle?: Property.ColumnRuleStyle | undefined;
MozColumnRuleWidth?: Property.ColumnRuleWidth<string | number> | undefined;
MozColumnWidth?: Property.ColumnWidth<string | number> | undefined;
MozContextProperties?: Property.MozContextProperties | undefined;
MozFontFeatureSettings?: Property.FontFeatureSettings | undefined;
MozFontLanguageOverride?: Property.FontLanguageOverride | undefined;
MozHyphens?: Property.Hyphens | undefined;
MozMarginEnd?: Property.MarginInlineEnd<string | number> | undefined;
MozMarginStart?: Property.MarginInlineStart<string | number> | undefined;
MozOrient?: Property.MozOrient | undefined;
MozOsxFontSmoothing?: Property.FontSmooth<string | number> | undefined;
MozOutlineRadiusBottomleft?: Property.MozOutlineRadiusBottomleft<string | number> | undefined;
MozOutlineRadiusBottomright?: Property.MozOutlineRadiusBottomright<string | number> | undefined;
MozOutlineRadiusTopleft?: Property.MozOutlineRadiusTopleft<string | number> | undefined;
MozOutlineRadiusTopright?: Property.MozOutlineRadiusTopright<string | number> | undefined;
MozPaddingEnd?: Property.PaddingInlineEnd<string | number> | undefined;
MozPaddingStart?: Property.PaddingInlineStart<string | number> | undefined;
MozPerspective?: Property.Perspective<string | number> | undefined;
MozPerspectiveOrigin?: Property.PerspectiveOrigin<string | number> | undefined;
MozStackSizing?: Property.MozStackSizing | undefined;
MozTabSize?: Property.TabSize<string | number> | undefined;
MozTextBlink?: Property.MozTextBlink | undefined;
MozTextSizeAdjust?: Property.TextSizeAdjust | undefined;
MozTransform?: Property.Transform | undefined;
MozTransformOrigin?: Property.TransformOrigin<string | number> | undefined;
MozTransformStyle?: Property.TransformStyle | undefined;
MozUserModify?: Property.MozUserModify | undefined;
MozUserSelect?: Property.UserSelect | undefined;
MozWindowDragging?: Property.MozWindowDragging | undefined;
MozWindowShadow?: Property.MozWindowShadow | undefined;
msAccelerator?: Property.MsAccelerator | undefined;
msBlockProgression?: Property.MsBlockProgression | undefined;
msContentZoomChaining?: Property.MsContentZoomChaining | undefined;
msContentZoomLimitMax?: Property.MsContentZoomLimitMax | undefined;
msContentZoomLimitMin?: Property.MsContentZoomLimitMin | undefined;
msContentZoomSnapPoints?: Property.MsContentZoomSnapPoints | undefined;
msContentZoomSnapType?: Property.MsContentZoomSnapType | undefined;
msContentZooming?: Property.MsContentZooming | undefined;
msFilter?: Property.MsFilter | undefined;
msFlexDirection?: Property.FlexDirection | undefined;
msFlexPositive?: Property.FlexGrow | undefined;
msFlowFrom?: Property.MsFlowFrom | undefined;
msFlowInto?: Property.MsFlowInto | undefined;
msGridColumns?: Property.MsGridColumns<string | number> | undefined;
msGridRows?: Property.MsGridRows<string | number> | undefined;
msHighContrastAdjust?: Property.MsHighContrastAdjust | undefined;
msHyphenateLimitChars?: Property.MsHyphenateLimitChars | undefined;
msHyphenateLimitLines?: Property.MsHyphenateLimitLines | undefined;
msHyphenateLimitZone?: Property.MsHyphenateLimitZone<string | number> | undefined;
msHyphens?: Property.Hyphens | undefined;
msImeAlign?: Property.MsImeAlign | undefined;
msLineBreak?: Property.LineBreak | undefined;
msOrder?: Property.Order | undefined;
msOverflowStyle?: Property.MsOverflowStyle | undefined;
msOverflowX?: Property.OverflowX | undefined;
msOverflowY?: Property.OverflowY | undefined;
msScrollChaining?: Property.MsScrollChaining | undefined;
msScrollLimitXMax?: Property.MsScrollLimitXMax<string | number> | undefined;
msScrollLimitXMin?: Property.MsScrollLimitXMin<string | number> | undefined;
msScrollLimitYMax?: Property.MsScrollLimitYMax<string | number> | undefined;
msScrollLimitYMin?: Property.MsScrollLimitYMin<string | number> | undefined;
msScrollRails?: Property.MsScrollRails | undefined;
msScrollSnapPointsX?: Property.MsScrollSnapPointsX | undefined;
msScrollSnapPointsY?: Property.MsScrollSnapPointsY | undefined;
msScrollSnapType?: Property.MsScrollSnapType | undefined;
msScrollTranslation?: Property.MsScrollTranslation | undefined;
msScrollbar3dlightColor?: Property.MsScrollbar3dlightColor | undefined;
msScrollbarArrowColor?: Property.MsScrollbarArrowColor | undefined;
msScrollbarBaseColor?: Property.MsScrollbarBaseColor | undefined;
msScrollbarDarkshadowColor?: Property.MsScrollbarDarkshadowColor | undefined;
msScrollbarFaceColor?: Property.MsScrollbarFaceColor | undefined;
msScrollbarHighlightColor?: Property.MsScrollbarHighlightColor | undefined;
msScrollbarShadowColor?: Property.MsScrollbarShadowColor | undefined;
msScrollbarTrackColor?: Property.MsScrollbarTrackColor | undefined;
msTextAutospace?: Property.MsTextAutospace | undefined;
msTextCombineHorizontal?: Property.TextCombineUpright | undefined;
msTextOverflow?: Property.TextOverflow | undefined;
msTouchAction?: Property.TouchAction | undefined;
msTouchSelect?: Property.MsTouchSelect | undefined;
msTransform?: Property.Transform | undefined;
msTransformOrigin?: Property.TransformOrigin<string | number> | undefined;
msTransitionDelay?: Property.TransitionDelay<string & {}> | undefined;
msTransitionDuration?: Property.TransitionDuration<string & {}> | undefined;
msTransitionProperty?: Property.TransitionProperty | undefined;
msTransitionTimingFunction?: Property.TransitionTimingFunction | undefined;
msUserSelect?: Property.MsUserSelect | undefined;
msWordBreak?: Property.WordBreak | undefined;
msWrapFlow?: Property.MsWrapFlow | undefined;
msWrapMargin?: Property.MsWrapMargin<string | number> | undefined;
msWrapThrough?: Property.MsWrapThrough | undefined;
msWritingMode?: Property.WritingMode | undefined;
WebkitAlignContent?: Property.AlignContent | undefined;
WebkitAlignItems?: Property.AlignItems | undefined;
WebkitAlignSelf?: Property.AlignSelf | undefined;
WebkitAnimationDelay?: Property.AnimationDelay<string & {}> | undefined;
WebkitAnimationDirection?: Property.AnimationDirection | undefined;
WebkitAnimationDuration?: Property.AnimationDuration<string & {}> | undefined;
WebkitAnimationFillMode?: Property.AnimationFillMode | undefined;
WebkitAnimationIterationCount?: Property.AnimationIterationCount | undefined;
WebkitAnimationName?: Property.AnimationName | undefined;
WebkitAnimationPlayState?: Property.AnimationPlayState | undefined;
WebkitAnimationTimingFunction?: Property.AnimationTimingFunction | undefined;
WebkitAppearance?: Property.WebkitAppearance | undefined;
WebkitBackdropFilter?: Property.BackdropFilter | undefined;
WebkitBackfaceVisibility?: Property.BackfaceVisibility | undefined;
WebkitBackgroundClip?: Property.BackgroundClip | undefined;
WebkitBackgroundOrigin?: Property.BackgroundOrigin | undefined;
WebkitBackgroundSize?: Property.BackgroundSize<string | number> | undefined;
WebkitBorderBeforeColor?: Property.WebkitBorderBeforeColor | undefined;
WebkitBorderBeforeStyle?: Property.WebkitBorderBeforeStyle | undefined;
WebkitBorderBeforeWidth?: Property.WebkitBorderBeforeWidth<string | number> | undefined;
WebkitBorderBottomLeftRadius?: Property.BorderBottomLeftRadius<string | number> | undefined;
WebkitBorderBottomRightRadius?: Property.BorderBottomRightRadius<string | number> | undefined;
WebkitBorderImageSlice?: Property.BorderImageSlice | undefined;
WebkitBorderTopLeftRadius?: Property.BorderTopLeftRadius<string | number> | undefined;
WebkitBorderTopRightRadius?: Property.BorderTopRightRadius<string | number> | undefined;
WebkitBoxDecorationBreak?: Property.BoxDecorationBreak | undefined;
WebkitBoxReflect?: Property.WebkitBoxReflect<string | number> | undefined;
WebkitBoxShadow?: Property.BoxShadow | undefined;
WebkitBoxSizing?: Property.BoxSizing | undefined;
WebkitClipPath?: Property.ClipPath | undefined;
WebkitColumnCount?: Property.ColumnCount | undefined;
WebkitColumnFill?: Property.ColumnFill | undefined;
WebkitColumnRuleColor?: Property.ColumnRuleColor | undefined;
WebkitColumnRuleStyle?: Property.ColumnRuleStyle | undefined;
WebkitColumnRuleWidth?: Property.ColumnRuleWidth<string | number> | undefined;
WebkitColumnSpan?: Property.ColumnSpan | undefined;
WebkitColumnWidth?: Property.ColumnWidth<string | number> | undefined;
WebkitFilter?: Property.Filter | undefined;
WebkitFlexBasis?: Property.FlexBasis<string | number> | undefined;
WebkitFlexDirection?: Property.FlexDirection | undefined;
WebkitFlexGrow?: Property.FlexGrow | undefined;
WebkitFlexShrink?: Property.FlexShrink | undefined;
WebkitFlexWrap?: Property.FlexWrap | undefined;
WebkitFontFeatureSettings?: Property.FontFeatureSettings | undefined;
WebkitFontKerning?: Property.FontKerning | undefined;
WebkitFontSmoothing?: Property.FontSmooth<string | number> | undefined;
WebkitFontVariantLigatures?: Property.FontVariantLigatures | undefined;
WebkitHyphenateCharacter?: Property.HyphenateCharacter | undefined;
WebkitHyphens?: Property.Hyphens | undefined;
WebkitInitialLetter?: Property.InitialLetter | undefined;
WebkitJustifyContent?: Property.JustifyContent | undefined;
WebkitLineBreak?: Property.LineBreak | undefined;
WebkitLineClamp?: Property.WebkitLineClamp | undefined;
WebkitLogicalHeight?: Property.BlockSize<string | number> | undefined;
WebkitLogicalWidth?: Property.InlineSize<string | number> | undefined;
WebkitMarginEnd?: Property.MarginInlineEnd<string | number> | undefined;
WebkitMarginStart?: Property.MarginInlineStart<string | number> | undefined;
WebkitMaskAttachment?: Property.WebkitMaskAttachment | undefined;
WebkitMaskBoxImageOutset?: Property.MaskBorderOutset<string | number> | undefined;
WebkitMaskBoxImageRepeat?: Property.MaskBorderRepeat | undefined;
WebkitMaskBoxImageSlice?: Property.MaskBorderSlice | undefined;
WebkitMaskBoxImageSource?: Property.MaskBorderSource | undefined;
WebkitMaskBoxImageWidth?: Property.MaskBorderWidth<string | number> | undefined;
WebkitMaskClip?: Property.WebkitMaskClip | undefined;
WebkitMaskComposite?: Property.WebkitMaskComposite | undefined;
WebkitMaskImage?: Property.WebkitMaskImage | undefined;
WebkitMaskOrigin?: Property.WebkitMaskOrigin | undefined;
WebkitMaskPosition?: Property.WebkitMaskPosition<string | number> | undefined;
WebkitMaskPositionX?: Property.WebkitMaskPositionX<string | number> | undefined;
WebkitMaskPositionY?: Property.WebkitMaskPositionY<string | number> | undefined;
WebkitMaskRepeat?: Property.WebkitMaskRepeat | undefined;
WebkitMaskRepeatX?: Property.WebkitMaskRepeatX | undefined;
WebkitMaskRepeatY?: Property.WebkitMaskRepeatY | undefined;
WebkitMaskSize?: Property.WebkitMaskSize<string | number> | undefined;
WebkitMaxInlineSize?: Property.MaxInlineSize<string | number> | undefined;
WebkitOrder?: Property.Order | undefined;
WebkitOverflowScrolling?: Property.WebkitOverflowScrolling | undefined;
WebkitPaddingEnd?: Property.PaddingInlineEnd<string | number> | undefined;
WebkitPaddingStart?: Property.PaddingInlineStart<string | number> | undefined;
WebkitPerspective?: Property.Perspective<string | number> | undefined;
WebkitPerspectiveOrigin?: Property.PerspectiveOrigin<string | number> | undefined;
WebkitPrintColorAdjust?: Property.PrintColorAdjust | undefined;
WebkitRubyPosition?: Property.RubyPosition | undefined;
WebkitScrollSnapType?: Property.ScrollSnapType | undefined;
WebkitShapeMargin?: Property.ShapeMargin<string | number> | undefined;
WebkitTapHighlightColor?: Property.WebkitTapHighlightColor | undefined;
WebkitTextCombine?: Property.TextCombineUpright | undefined;
WebkitTextDecorationColor?: Property.TextDecorationColor | undefined;
WebkitTextDecorationLine?: Property.TextDecorationLine | undefined;
WebkitTextDecorationSkip?: Property.TextDecorationSkip | undefined;
WebkitTextDecorationStyle?: Property.TextDecorationStyle | undefined;
WebkitTextEmphasisColor?: Property.TextEmphasisColor | undefined;
WebkitTextEmphasisPosition?: Property.TextEmphasisPosition | undefined;
WebkitTextEmphasisStyle?: Property.TextEmphasisStyle | undefined;
WebkitTextFillColor?: Property.WebkitTextFillColor | undefined;
WebkitTextOrientation?: Property.TextOrientation | undefined;
WebkitTextSizeAdjust?: Property.TextSizeAdjust | undefined;
WebkitTextStrokeColor?: Property.WebkitTextStrokeColor | undefined;
WebkitTextStrokeWidth?: Property.WebkitTextStrokeWidth<string | number> | undefined;
WebkitTextUnderlinePosition?: Property.TextUnderlinePosition | undefined;
WebkitTouchCallout?: Property.WebkitTouchCallout | undefined;
WebkitTransform?: Property.Transform | undefined;
WebkitTransformOrigin?: Property.TransformOrigin<string | number> | undefined;
WebkitTransformStyle?: Property.TransformStyle | undefined;
WebkitTransitionDelay?: Property.TransitionDelay<string & {}> | undefined;
WebkitTransitionDuration?: Property.TransitionDuration<string & {}> | undefined;
WebkitTransitionProperty?: Property.TransitionProperty | undefined;
WebkitTransitionTimingFunction?: Property.TransitionTimingFunction | undefined;
WebkitUserModify?: Property.WebkitUserModify | undefined;
WebkitUserSelect?: Property.WebkitUserSelect | undefined;
WebkitWritingMode?: Property.WritingMode | undefined;
MozAnimation?: Property.Animation<string & {}> | undefined;
MozBorderImage?: Property.BorderImage | undefined;
MozColumnRule?: Property.ColumnRule<string | number> | undefined;
MozColumns?: Property.Columns<string | number> | undefined;
MozOutlineRadius?: Property.MozOutlineRadius<string | number> | undefined;
MozTransition?: Property.Transition<string & {}> | undefined;
msContentZoomLimit?: Property.MsContentZoomLimit | undefined;
msContentZoomSnap?: Property.MsContentZoomSnap | undefined;
msFlex?: Property.Flex<string | number> | undefined;
msScrollLimit?: Property.MsScrollLimit | undefined;
msScrollSnapX?: Property.MsScrollSnapX | undefined;
msScrollSnapY?: Property.MsScrollSnapY | undefined;
msTransition?: Property.Transition<string & {}> | undefined;
WebkitAnimation?: Property.Animation<string & {}> | undefined;
WebkitBorderBefore?: Property.WebkitBorderBefore<string | number> | undefined;
WebkitBorderImage?: Property.BorderImage | undefined;
WebkitBorderRadius?: Property.BorderRadius<string | number> | undefined;
WebkitColumnRule?: Property.ColumnRule<string | number> | undefined;
WebkitColumns?: Property.Columns<string | number> | undefined;
WebkitFlex?: Property.Flex<string | number> | undefined;
WebkitFlexFlow?: Property.FlexFlow | undefined;
WebkitMask?: Property.WebkitMask<string | number> | undefined;
WebkitMaskBoxImage?: Property.MaskBorder | undefined;
WebkitTextEmphasis?: Property.TextEmphasis | undefined;
WebkitTextStroke?: Property.WebkitTextStroke<string | number> | undefined;
WebkitTransition?: Property.Transition<string & {}> | undefined;
boxAlign?: Property.BoxAlign | undefined;
boxDirection?: Property.BoxDirection | undefined;
boxFlex?: Property.BoxFlex | undefined;
boxFlexGroup?: Property.BoxFlexGroup | undefined;
boxLines?: Property.BoxLines | undefined;
boxOrdinalGroup?: Property.BoxOrdinalGroup | undefined;
boxOrient?: Property.BoxOrient | undefined;
boxPack?: Property.BoxPack | undefined;
clip?: Property.Clip | undefined;
fontStretch?: Property.FontStretch | undefined;
gridColumnGap?: Property.GridColumnGap<string | number> | undefined;
gridGap?: Property.GridGap<string | number> | undefined;
gridRowGap?: Property.GridRowGap<string | number> | undefined;
imeMode?: Property.ImeMode | undefined;
insetArea?: Property.PositionArea | undefined;
offsetBlock?: Property.InsetBlock<string | number> | undefined;
offsetBlockEnd?: Property.InsetBlockEnd<string | number> | undefined;
offsetBlockStart?: Property.InsetBlockStart<string | number> | undefined;
offsetInline?: Property.InsetInline<string | number> | undefined;
offsetInlineEnd?: Property.InsetInlineEnd<string | number> | undefined;
offsetInlineStart?: Property.InsetInlineStart<string | number> | undefined;
pageBreakAfter?: Property.PageBreakAfter | undefined;
pageBreakBefore?: Property.PageBreakBefore | undefined;
pageBreakInside?: Property.PageBreakInside | undefined;
positionTryOptions?: Property.PositionTryFallbacks | undefined;
scrollSnapCoordinate?: Property.ScrollSnapCoordinate<string | number> | undefined;
scrollSnapDestination?: Property.ScrollSnapDestination<string | number> | undefined;
scrollSnapPointsX?: Property.ScrollSnapPointsX | undefined;
scrollSnapPointsY?: Property.ScrollSnapPointsY | undefined;
scrollSnapTypeX?: Property.ScrollSnapTypeX | undefined;
scrollSnapTypeY?: Property.ScrollSnapTypeY | undefined;
KhtmlBoxAlign?: Property.BoxAlign | undefined;
KhtmlBoxDirection?: Property.BoxDirection | undefined;
KhtmlBoxFlex?: Property.BoxFlex | undefined;
KhtmlBoxFlexGroup?: Property.BoxFlexGroup | undefined;
KhtmlBoxLines?: Property.BoxLines | undefined;
KhtmlBoxOrdinalGroup?: Property.BoxOrdinalGroup | undefined;
KhtmlBoxOrient?: Property.BoxOrient | undefined;
KhtmlBoxPack?: Property.BoxPack | undefined;
KhtmlLineBreak?: Property.LineBreak | undefined;
KhtmlOpacity?: Property.Opacity | undefined;
KhtmlUserSelect?: Property.UserSelect | undefined;
MozBackgroundClip?: Property.BackgroundClip | undefined;
MozBackgroundOrigin?: Property.BackgroundOrigin | undefined;
MozBackgroundSize?: Property.BackgroundSize<string | number> | undefined;
MozBorderRadius?: Property.BorderRadius<string | number> | undefined;
MozBorderRadiusBottomleft?: Property.BorderBottomLeftRadius<string | number> | undefined;
MozBorderRadiusBottomright?: Property.BorderBottomRightRadius<string | number> | undefined;
MozBorderRadiusTopleft?: Property.BorderTopLeftRadius<string | number> | undefined;
MozBorderRadiusTopright?: Property.BorderTopRightRadius<string | number> | undefined;
MozBoxAlign?: Property.BoxAlign | undefined;
MozBoxDirection?: Property.BoxDirection | undefined;
MozBoxFlex?: Property.BoxFlex | undefined;
MozBoxOrdinalGroup?: Property.BoxOrdinalGroup | undefined;
MozBoxOrient?: Property.BoxOrient | undefined;
MozBoxPack?: Property.BoxPack | undefined;
MozBoxShadow?: Property.BoxShadow | undefined;
MozColumnCount?: Property.ColumnCount | undefined;
MozColumnFill?: Property.ColumnFill | undefined;
MozFloatEdge?: Property.MozFloatEdge | undefined;
MozForceBrokenImageIcon?: Property.MozForceBrokenImageIcon | undefined;
MozOpacity?: Property.Opacity | undefined;
MozOutline?: Property.Outline<string | number> | undefined;
MozOutlineColor?: Property.OutlineColor | undefined;
MozOutlineStyle?: Property.OutlineStyle | undefined;
MozOutlineWidth?: Property.OutlineWidth<string | number> | undefined;
MozTextAlignLast?: Property.TextAlignLast | undefined;
MozTextDecorationColor?: Property.TextDecorationColor | undefined;
MozTextDecorationLine?: Property.TextDecorationLine | undefined;
MozTextDecorationStyle?: Property.TextDecorationStyle | undefined;
MozTransitionDelay?: Property.TransitionDelay<string & {}> | undefined;
MozTransitionDuration?: Property.TransitionDuration<string & {}> | undefined;
MozTransitionProperty?: Property.TransitionProperty | undefined;
MozTransitionTimingFunction?: Property.TransitionTimingFunction | undefined;
MozUserFocus?: Property.MozUserFocus | undefined;
MozUserInput?: Property.MozUserInput | undefined;
msImeMode?: Property.ImeMode | undefined;
OAnimation?: Property.Animation<string & {}> | undefined;
OAnimationDelay?: Property.AnimationDelay<string & {}> | undefined;
OAnimationDirection?: Property.AnimationDirection | undefined;
OAnimationDuration?: Property.AnimationDuration<string & {}> | undefined;
OAnimationFillMode?: Property.AnimationFillMode | undefined;
OAnimationIterationCount?: Property.AnimationIterationCount | undefined;
OAnimationName?: Property.AnimationName | undefined;
OAnimationPlayState?: Property.AnimationPlayState | undefined;
OAnimationTimingFunction?: Property.AnimationTimingFunction | undefined;
OBackgroundSize?: Property.BackgroundSize<string | number> | undefined;
OBorderImage?: Property.BorderImage | undefined;
OObjectFit?: Property.ObjectFit | undefined;
OObjectPosition?: Property.ObjectPosition<string | number> | undefined;
OTabSize?: Property.TabSize<string | number> | undefined;
OTextOverflow?: Property.TextOverflow | undefined;
OTransform?: Property.Transform | undefined;
OTransformOrigin?: Property.TransformOrigin<string | number> | undefined;
OTransition?: Property.Transition<string & {}> | undefined;
OTransitionDelay?: Property.TransitionDelay<string & {}> | undefined;
OTransitionDuration?: Property.TransitionDuration<string & {}> | undefined;
OTransitionProperty?: Property.TransitionProperty | undefined;
OTransitionTimingFunction?: Property.TransitionTimingFunction | undefined;
WebkitBoxAlign?: Property.BoxAlign | undefined;
WebkitBoxDirection?: Property.BoxDirection | undefined;
WebkitBoxFlex?: Property.BoxFlex | undefined;
WebkitBoxFlexGroup?: Property.BoxFlexGroup | undefined;
WebkitBoxLines?: Property.BoxLines | undefined;
WebkitBoxOrdinalGroup?: Property.BoxOrdinalGroup | undefined;
WebkitBoxOrient?: Property.BoxOrient | undefined;
WebkitBoxPack?: Property.BoxPack | undefined;
colorInterpolation?: Property.ColorInterpolation | undefined;
colorRendering?: Property.ColorRendering | undefined;
glyphOrientationVertical?: Property.GlyphOrientationVertical | undefined;
};
role: "group";
'aria-label': string;
'aria-describedby': string | undefined;
'aria-labelledby': string | undefined;
}, HTMLDivElement>;

declare interface ChartConfig<TMeta = unknown> {
    /** Fixed CSS-pixel width. Omit and set `autoResize` to fill the container. */
    width?: number;
    /** Fixed CSS-pixel height. Omit and set `autoResize` to fill the container. */
    height?: number;
    /**
     * Track the container's size with a ResizeObserver and repaint on change.
     * Default: `true`. Set `false` and provide `width`/`height` for a fixed size.
     */
    autoResize?: boolean;
    /**
     * Plot-area inset in CSS pixels. Any side omitted falls back to the
     * defaults (top 24, right 24, bottom 44, left 56); `left` is a floor and
     * grows automatically to fit measured y-axis labels.
     */
    padding?: {
        top?: number;
        right?: number;
        bottom?: number;
        left?: number;
    };
    /**
     * Axis definitions keyed by axis key. `'x'`/`'y'` are conventional; extra
     * keys (e.g. `'y2'`) create additional axes that series bind to via
     * `xAxisKey`/`yAxisKey`. Omitted axes default to a linear scale.
     */
    axes?: Record<string, AxisConfig>;
    /** Series to draw, in paint order (later series draw on top). Required. */
    series: SeriesConfig<TMeta>[];
    /** Interaction mode preset, sets default gesture mappings. Default: `'timeseries'`. */
    interaction?: InteractionMode;
    /** Crosshair + indicator config. Merged over the mode preset. */
    cursor?: CursorConfig;
    /** Zoom gesture config. Merged over the mode preset. */
    zoom?: ZoomConfig;
    /** Pan gesture config. Merged over the mode preset. */
    pan?: PanConfig;
    /** Box-selection callback config. */
    selection?: SelectionConfig;
    /** Tooltip config. Merged over the mode preset. */
    tooltip?: TooltipConfig;
    /** Touch-specific gesture overrides layered on top of the mode preset. */
    touch?: TouchConfig;
    /** Series highlight + dim config. */
    highlight?: HighlightConfig;
    /** Ring-buffer window for `appendData` streaming. */
    streaming?: StreamingConfig;
    /** Large-dataset interaction tuning. */
    performance?: PerformanceConfig;
    /** Timing diagnostics. Off by default. */
    debug?: DebugConfig;
    /**
     * Theme overrides. Any field omitted resolves from CSS variables on the
     * container, then the built-in light/dark default. Pass a full exported
     * theme object to pin colors regardless of the page.
     */
    theme?: Partial<ThemeConfig>;
    /** Plugins installed at creation. Also addable later via `chart.use()`. */
    plugins?: Plugin_2[];
}

/** Controlled values are authoritative; defaults are applied only at mount. */
export declare interface ChartControls {
    'aria-label'?: string;
    'aria-describedby'?: string;
    'aria-labelledby'?: string;
    viewport?: Viewport;
    defaultViewport?: Viewport;
    onViewportChange?: (viewport: Viewport) => void;
    selectionState?: SelectionRange | null;
    defaultSelection?: SelectionRange | null;
    onSelectionChange?: (selection: SelectionRange | null) => void;
    hiddenSeries?: readonly string[];
    defaultHiddenSeries?: readonly string[];
    onHiddenSeriesChange?: (ids: readonly string[]) => void;
}

declare interface ChartEvents<Row = Record<string, unknown>> {
    'state:change': ChartState<Row>;
    'cursor:change': CursorSnapshot<Row>;
    'viewport:change': Viewport;
    'selection:change': SelectionRange | null;
    'visibility:change': readonly string[];
    'highlight:change': string | null;
    'follow:change': boolean;
    'point:click': ChartPoint<Row>;
    select: SelectionResult_2<Row>;
    'data:update': undefined;
    'options:update': ChartOptions<Row>;
    'theme:update': ThemeConfig;
    resize: {
        width: number;
        height: number;
    };
}

export declare interface ChartGroup {
    readonly options: Readonly<ChartGroupOptions>;
    setCursor(value: number | string | null): void;
    setHighlight(id: string | null): void;
    destroy(): void;
}

declare interface ChartGroup_2 {
    readonly options: Readonly<ChartGroupOptions_2>;
    setCursor(value: number | string | null): void;
    setHighlight(id: string | null): void;
    destroy(): void;
}

export declare interface ChartGroupOptions {
    cursor?: boolean;
    highlight?: boolean;
    viewport?: boolean;
    yRange?: boolean;
    yAxis?: string;
    alignPlots?: boolean;
}

declare interface ChartGroupOptions_2 {
    cursor?: boolean;
    highlight?: boolean;
    viewport?: boolean;
    yRange?: boolean;
    yAxis?: string;
    alignPlots?: boolean;
}

export declare interface ChartHandle<Row = Record<string, unknown>> {
    readonly container: HTMLElement;
    update(patch: ChartPatch<Row>): void;
    appendData(data: DataSource<Row>, options?: AppendOptions): void;
    getOptions(): Readonly<ChartOptions<Row>>;
    getState(): ChartState<Row>;
    subscribe(listener: () => void): () => void;
    on<K extends keyof ChartEvents<Row>>(event: K, listener: (value: ChartEvents<Row>[K]) => void): () => void;
    setViewport(viewport: Viewport): void;
    resetViewport(): void;
    resumeFollow(): void;
    setSelection(selection: SelectionRange | null): void;
    setSeriesVisible(id: string, visible: boolean): void;
    setHighlight(id: string | null): void;
    setCursor(x: number | string | null): void;
    getCursorSnapshot(options?: CursorSnapshotOptions): CursorSnapshot<Row>;
    getLegendItems(): LegendItem[];
    getTheme(): ThemeConfig;
    getLayout(): Layout;
    getStats(): ChartStats;
    getAxis(key: string): Readonly<ScaleRange & {
        type: string;
    }> | undefined;
    refreshTheme(): void;
    resize(width: number, height: number): void;
    redraw(): void;
    destroy(): void;
}

export declare interface ChartOptions<Row = Record<string, unknown>> extends Omit<ChartConfig, 'series' | 'axes' | 'streaming' | 'plugins' | 'highlight' | 'selection' | 'tooltip' | 'cursor' | 'zoom'> {
    data?: DataSource<Row>;
    x?: Accessor<Row, AxisValue>;
    rowId?: Accessor<Row, RowId>;
    series: readonly SeriesOptions<Row>[];
    axes?: Record<string, AxisOptions>;
    streaming?: {
        maxPoints?: number;
        followWindow?: number;
    };
    referenceLines?: readonly ReferenceLine[];
    referenceRegions?: readonly ReferenceRegion[];
    plugins?: readonly ChartPlugin<Row>[];
    group?: ChartGroup;
    cursor?: CursorConfig;
    zoom?: ZoomConfig;
    highlight?: HighlightConfig;
    selection?: Omit<NonNullable<ChartConfig['selection']>, 'onSelect' | 'onBrush'>;
    tooltip?: Omit<NonNullable<ChartConfig['tooltip']>, 'yFormat' | 'rangeFormat' | 'render' | 'xFormat'> & {
        xFormat?(value: number | string): string;
        /** Strings are rendered as HTML; use a DOM node with textContent for untrusted values. */
        render?: (points: readonly ChartPoint<Row>[]) => string | HTMLElement;
        yFormat?: (value: number, seriesId: string) => string;
        rangeFormat?: (min: number, max: number, seriesId: string) => string;
    };
    /** Accessible name; no visual chart title is added. */
    ariaLabel?: string;
    onPointClick?: (point: ChartPoint<Row>) => void;
    onSelect?: (selection: SelectionResult_2<Row>) => void;
}

declare type ChartPatch<Row> = {
    [K in keyof ChartOptions<Row>]?: K extends 'data' | 'series' | 'plugins' | 'group' ? ChartOptions<Row>[K] : OptionPatch<ChartOptions<Row>[K]>;
};

declare interface ChartPlugin<Row = Record<string, unknown>> {
    id: string;
    install?(chart: ChartHandle<Row>): void;
    destroy?(chart: ChartHandle<Row>): void;
    beforeDraw?(chart: ChartHandle<Row>): boolean | void;
    afterDrawGrid?(chart: ChartHandle<Row>, context: CanvasRenderingContext2D): void;
    afterDrawData?(chart: ChartHandle<Row>, context: CanvasRenderingContext2D): void;
    afterDrawOverlay?(chart: ChartHandle<Row>, context: CanvasRenderingContext2D): void;
    onDataUpdate?(chart: ChartHandle<Row>): void;
    onOptionsUpdate?(chart: ChartHandle<Row>): void;
}

export declare interface ChartPoint<Row = Record<string, unknown>> {
    seriesId: string;
    label: string;
    row?: Row;
    rowIndex: number;
    rowId?: RowId;
    x: number | string;
    /** Histogram bin interval, in numeric axis units. */
    xRange?: ScaleRange;
    y: number;
    radius?: number;
    fields?: readonly {
        label: string;
        value: number | string;
        formatted: string;
    }[];
    formattedX: string;
    formattedY: string;
    color: string;
    meta?: unknown;
}

declare interface ChartPoint_2<Row = Record<string, unknown>> {
    seriesId: string;
    label: string;
    row?: Row;
    rowIndex: number;
    rowId?: RowId_2;
    x: number | string;
    /** Histogram bin interval, in numeric axis units. */
    xRange?: ScaleRange_2;
    y: number;
    radius?: number;
    fields?: readonly {
        label: string;
        value: number | string;
        formatted: string;
    }[];
    formattedX: string;
    formattedY: string;
    color: string;
    meta?: unknown;
}

export declare interface ChartProps<Row = Record<string, unknown>> extends ChartOptions<Row>, ChartControls {
    className?: string;
    style?: CSSProperties;
    ref?: Ref<ChartHandle<Row>>;
    onReady?: (chart: ChartHandle<Row>) => void;
}

export declare interface ChartState<Row = Record<string, unknown>> {
    viewport: Viewport;
    selection: SelectionRange | null;
    hiddenSeries: readonly string[];
    highlightedSeries: string | null;
    following: boolean;
    cursor: CursorSnapshot<Row>;
}

declare interface ChartState_2<Row = Record<string, unknown>> {
    viewport: Viewport_2;
    selection: SelectionRange_2 | null;
    hiddenSeries: readonly string[];
    highlightedSeries: string | null;
    following: boolean;
    cursor: CursorSnapshot_2<Row>;
}

declare interface ChartStats {
    /** Monotonic counter bumped on every data change; useful as a cache key. */
    dataVersion: number;
    /** Number of `setData` calls since creation. */
    setDataCount: number;
    /** Number of `appendData` calls since creation. */
    appendDataCount: number;
    /** Per-layer paint counts. A layer that never changes stays flat, which is the point of the layer split. */
    renderCount: {
        grid: number;
        data: number;
        overlay: number;
    };
    /**
     * Per-layer duration of the most recent paint, in milliseconds. Stays `0`
     * unless `debug.stats` is enabled, since timing each layer has a cost.
     */
    lastRenderMs: {
        grid: number;
        data: number;
        overlay: number;
    };
}

/**
 * Mark type for a series. Public bands name `lower` and `upper` fields;
 * histogram series consume explicit binning results. Defaults to `line`.
 */
declare type ChartType = 'line' | 'area' | 'band' | 'scatter' | 'bar' | 'histogram';

declare type ColorEncoding<Row> = Accessor<Row, number | string | null | undefined> | (Omit<ScatterColorEncoding, 'dataIndex' | 'categoryValues'> & {
    field: Accessor<Row, number | string | null | undefined>;
});

export declare function column<Row>(spec: LegendTableColumn<Row>): LegendTableColumn<Row>;

/**
 * Columnar data format: index 0 is always X values, indices 1..N are Y series.
 * All arrays must have identical length. X values (index 0) MUST be sorted
 * monotonically non-decreasing. This constraint enables O(log n) binary search
 * for viewport culling, hit-testing, and cursor snapping.
 */
declare type ColumnarData = [xValues: Float64Array, ...yValues: Float64Array[]];

declare interface ColumnData {
    columns: Record<string, Float64Array>;
    rowIds?: readonly RowId[];
}

declare interface CursorConfig {
    /** Master switch for the crosshair + indicators. Default: `true`. */
    show?: boolean;
    /**
     * Snap the cursor to the nearest data X index instead of tracking the
     * raw pointer position. Default: `true`. Keeps indicators on real samples.
     */
    snap?: boolean;
    /** Draw the vertical crosshair line. Default: `true`. */
    xLine?: boolean;
    /**
     * Draw the horizontal crosshair line. Default: `false`; most time-series
     * charts only want the vertical line.
     */
    yLine?: boolean;
    /**
     * Whether to draw the filled dot + ring at each series' hit-tested
     * point while hovering. Default: `true`. Set to `false` when a legend
     * table already surfaces per-series values below the chart and the
     * extra glyphs would be visual noise.
     */
    indicators?: boolean;
    /** Crosshair line color. Defaults to `theme.crosshairColor`. */
    color?: string;
    /**
     * Crosshair dash pattern, alternating dash/gap lengths in CSS pixels per
     * the Canvas `setLineDash()` spec. Default: solid.
     */
    dash?: number[];
    /**
     * On a synced chart, also show this chart's tooltip when the cursor is
     * driven by a peer. Default: `false`, synced charts show crosshair only
     * so a dashboard does not sprout duplicate tooltips.
     */
    syncTooltip?: boolean;
}

export declare interface CursorSnapshot<Row = Record<string, unknown>> {
    x: number | string | null;
    formattedX: string;
    points: readonly ChartPoint<Row>[];
    source: 'cursor' | 'latest' | 'first' | 'none';
    activeSeriesId: string | null;
}

declare interface CursorSnapshot_2<Row = Record<string, unknown>> {
    x: number | string | null;
    formattedX: string;
    points: readonly ChartPoint_2<Row>[];
    source: 'cursor' | 'latest' | 'first' | 'none';
    activeSeriesId: string | null;
}

/** Options accepted by `getCursorSnapshot()` and the reactive primitive. */
declare interface CursorSnapshotOptions {
    /**
     * What to return when the cursor is not over the chart.
     * - `hide`   → empty snapshot, source === 'none'
     * - `latest` → snapshot at the last X value
     * - `first`  → snapshot at the first X value
     * Default: `'hide'`.
     */
    fallback?: 'hide' | 'latest' | 'first';
}

declare type DataSource<Row> = readonly Row[] | ColumnData | HistogramBins;

declare interface DebugConfig {
    /**
     * Enable lightweight timing diagnostics. Counters are always maintained,
     * but per-layer duration measurement only runs when this is true.
     */
    stats?: boolean;
}

/**
 * What an engine plugin sees of the chart: the current plot rect, scales and
 * theme to draw against, and a way to ask for a repaint.
 */
declare interface EngineHost {
    /** Get current layout */
    getLayout(): Layout;
    /** Get a scale by axis key */
    getAxis(key: string): Scale | undefined;
    /**
     * Resolved theme after defaults, light/dark detection, and CSS variable
     * overrides. Plugins should color against this rather than re-deriving
     * palettes from the config, which holds only the caller's partial
     * overrides.
     */
    getTheme(): ThemeConfig;
    /** Force full redraw */
    redraw(): void;
}

declare type Field<Row, Value> = string extends keyof Row ? string : Extract<{
    [K in keyof Row]-?: NonNullable<Row[K]> extends Value ? K : never;
}[keyof Row], string>;

declare interface HighlightConfig {
    /** Master switch. Default: true. */
    enabled?: boolean;
    /**
     * Opacity multiplier applied to non-highlighted series when a
     * highlight is active. Default: 0.2.
     */
    dimOpacity?: number;
    /**
     * Auto-highlight the series nearest the cursor when its hit-tested
     * point is within this many CSS pixels vertically; clear the highlight
     * when nothing qualifies. Off when unset. Propagates through a chart
     * group like a manual `setHighlight()`, so linked charts dim together.
     */
    proximity?: number;
}

/**
 * Histogram utility, compute bins from raw data.
 *
 * This is a USER-FACING utility, not called internally by the chart.
 * The chart only renders pre-computed bins. The user controls
 * when and how to bin their data (P3: library never touches your data).
 *
 * Bin methods:
 * - Freedman-Diaconis (default): 2 * IQR * n^(-1/3), robust to outliers
 * - Sturges: ceil(log2(n) + 1), simple, good for normal distributions
 * - Scott: 3.5 * sigma / n^(1/3), optimized for Gaussian data
 *
 * Returns N+1 bin edges and N counts. Pass the result directly as a
 * histogram series dataset; callers never need to pad counts.
 */
declare interface HistogramBins {
    /** Bin edge values (length = N+1 for N bins) */
    edges: Float64Array;
    /** Count per bin (length = N) */
    counts: Float64Array;
    /** Maximum count */
    maxCount: number;
}

/**
 * Interaction modes define default gesture→action mappings:
 * - timeseries: mouse drag=box-zoom, shift+drag=pan, pinch=zoom-x
 * - analytical: mouse drag=box-zoom, shift+drag=pan, pinch=zoom-xy
 * - readonly: tooltip only, all navigation disabled (reports, embeds)
 *
 * Touch defaults are cursor-first: one-finger drag moves the cursor,
 * double-tap+drag selects, and two-finger pinch zooms.
 */
declare type InteractionMode = 'timeseries' | 'analytical' | 'readonly';

/**
 * Line/area path interpolation. `monotone` is a shape-preserving cubic that
 * never overshoots between points; the three `step-*` variants place the
 * riser before, after, or centered on each point. Defaults to `linear`.
 */
declare type InterpolationMode = 'linear' | 'monotone' | 'step-before' | 'step-after' | 'step-middle';

declare interface Layout {
    /** Total CSS pixel width of the chart container */
    width: number;
    /** Total CSS pixel height of the chart container */
    height: number;
    /** The data-rendering region */
    plot: {
        top: number;
        left: number;
        width: number;
        height: number;
    };
    /** Axis regions keyed by axis config key, with position and area */
    axes: Record<string, {
        position: AxisPosition;
        area: {
            left: number;
            top: number;
            width: number;
            height: number;
        };
    }>;
    /** Device pixel ratio */
    dpr: number;
}

declare interface LegendItem {
    id: string;
    label: string;
    type: SeriesConfig['type'];
    color: string;
    fill: string | null;
    visible: boolean;
    lineDash: number[];
    opacity: number;
    meta?: unknown;
}

export declare function LegendTable<Row>(props: LegendTableProps<Row>): ReactNode;

export declare interface LegendTableColumn<Row> {
    key: string;
    header: string;
    align?: 'left' | 'right' | 'center';
    width?: string;
    title?: string;
    cell: (point: ChartPoint<Row>, series: LegendItem, api: {
        setHighlight: (id: string | null) => void;
    }) => ReactNode;
}

export declare type LegendTableFallback = 'hide' | 'latest' | 'first' | 'series-only';

export declare interface LegendTableProps<Row = Record<string, unknown>> {
    chart: ChartHandle<Row> | null | undefined;
    fallback?: LegendTableFallback;
    columns?: readonly LegendTableColumn<Row>[];
    showStepHeader?: boolean;
    formatStep?: (value: number | string) => string;
    highlightOnHover?: boolean;
    maxHeight?: string;
    className?: string;
    style?: CSSProperties;
    children?: (snapshot: CursorSnapshot<Row> | undefined, highlight: string | null, setHighlight: (id: string | null) => void) => ReactNode;
}

export declare function metricColumn<Row>(resolve: (point: ChartPoint<Row>, series: LegendItem) => string, options?: {
    header?: string;
    truncate?: number;
}): LegendTableColumn<Row>;

export declare function nameColumn<Row>(options?: {
    swatch?: boolean;
    truncate?: number;
}): LegendTableColumn<Row>;

declare type Numeric<Row> = Accessor<Row, number | null | undefined>;

declare type OptionPatch<T> = T extends (...args: never[]) => unknown ? T : T extends readonly unknown[] ? T : T extends object ? {
    [K in keyof T]?: OptionPatch<T[K]> | undefined;
} : T;

declare interface PanConfig {
    /** Master switch for pan (shift+drag on mouse, one-finger on touch when `touch.drag: 'pan'`). Default: `true`. */
    enabled?: boolean;
    /** Allow panning along X. Default: `true`. */
    x?: boolean;
    /** Allow panning along Y. Default: `false`, matching the zoom Y default. */
    y?: boolean;
    /** Enable drag-to-pan gestures that start over axis gutters. Default: `false`. */
    axis?: boolean;
}

declare interface PerformanceConfig {
    /**
     * Point budget per scatter series while the viewport is actively
     * changing. When the visible count exceeds it, points are
     * stride-sampled for the duration of the gesture and a full-fidelity
     * repaint follows as soon as the viewport settles. Keeps pan and zoom
     * responsive on large point clouds without giving up crisp rendering
     * at rest. `false` disables sampling. Explicit numeric values are exact.
     * The automatic default is 10000 for mouse/keyboard interaction and an
     * adaptive `max(400, 1.5 × plot CSS width)` for touch/pen gestures.
     *
     * Density (heatmap) scatter ignores the budget, its cost is already
     * bounded by pixels, not points. Hit-testing and tooltips always use
     * the full data.
     */
    interactionSampling?: number | false;
}

declare interface Plugin_2 {
    /** Unique id. Registering a second plugin with the same id is rejected. */
    id: string;
    /** Called once when the plugin is added. Set up DOM / listeners here. */
    install?(chart: EngineHost): void;
    /** Called once when the plugin is removed or the chart is destroyed. Tear down here. */
    destroy?(chart: EngineHost): void;
    /** After gridlines/axes paint. Draw under the data here. */
    afterDrawGrid?(chart: EngineHost, ctx: CanvasRenderingContext2D): void;
    /** Before series marks paint. Return `false` to suppress the default data draw. */
    beforeDrawData?(chart: EngineHost, ctx: CanvasRenderingContext2D): boolean | void;
    /** After series marks paint. Annotations that sit above data go here (see `createReferenceLinesPlugin`). */
    afterDrawData?(chart: EngineHost, ctx: CanvasRenderingContext2D): void;
    /** After the overlay paints, the topmost draw layer. */
    afterDrawOverlay?(chart: EngineHost, ctx: CanvasRenderingContext2D): void;
    /** Fires after the chart's data changes: a replacement or an append. */
    onSetData?(chart: EngineHost, data: ColumnarData): void;
    /**
     * Fires after the chart's options change. Use this for plugins whose DOM /
     * visual state depends on config (series, axes, theme) rather than data,
     * legends, toolbars, stat readouts. Avoid listening on `onSetData` for
     * those: at high streaming rates it rebuilds the DOM underneath the user's
     * cursor.
     */
    onSetOptions?(chart: EngineHost): void;
}

declare interface ReferenceLine {
    axis: string;
    value: AxisValue;
    label?: string;
    color?: string;
    dash?: number[];
    lineWidth?: number;
}

declare interface ReferenceRegion {
    axis: string;
    from: AxisValue;
    to: AxisValue;
    label?: string;
    fill?: string;
    opacity?: number;
    edges?: boolean;
    edgeColor?: string;
    edgeDash?: number[];
}

declare type RowId = string | number;

declare type RowId_2 = string | number;

/**
 * A Scale is a pure function pair: dataToPixel and pixelToData.
 * Scales own a data domain and a pixel range, and convert between them.
 */
declare interface Scale {
    /** Scale kind. Fixed at creation; changing an axis type rebuilds the scale. */
    readonly type: ScaleType;
    /** The axis key this scale is bound to (the key in `ChartConfig.axes`). */
    readonly key: string;
    /**
     * Current domain lower bound in data units. Writable: assigning bypasses
     * auto-range and repaint, so prefer `chart.setAxis()` for user-facing edits.
     */
    min: number;
    /** Current domain upper bound in data units. Same write caveat as `min`. */
    max: number;
    /** Map a data-space value to a pixel coordinate within the plot area */
    dataToPixel(value: number): number;
    /** Map a pixel coordinate back to data-space */
    pixelToData(pixel: number): number;
    /**
     * Nice tick values for the current domain. `count` is a target hint, not a
     * guarantee: linear scales honor it via nice-number rounding, while time
     * and log scales derive density from the pixel range / decades and treat
     * `count` loosely. Defaults to `DEFAULT_TICK_COUNT` (6).
     */
    ticks(count?: number): number[];
    /** Format a single tick value for display using this scale's conventions. */
    tickFormat(value: number): string;
    /**
     * Round the domain outward to clean tick boundaries. Mutates `min`/`max`.
     * `count` is the same density hint as `ticks()`.
     */
    nice(count?: number): void;
    /** Set the pixel extent the domain maps onto. Called by layout on resize. */
    setPixelRange(pxMin: number, pxMax: number): void;
}

/** A closed data-space interval. `min` and `max` are in data units, not pixels. */
declare interface ScaleRange {
    /** Lower bound, inclusive. May exceed `max` only transiently during a gesture. */
    min: number;
    /** Upper bound, inclusive. */
    max: number;
}

/** A closed data-space interval. `min` and `max` are in data units, not pixels. */
declare interface ScaleRange_2 {
    /** Lower bound, inclusive. May exceed `max` only transiently during a gesture. */
    min: number;
    /** Upper bound, inclusive. */
    max: number;
}

/**
 * Scale kind for an axis. `time` treats X values as epoch milliseconds and
 * formats ticks in the viewer's local timezone; `log` requires strictly
 * positive domains. Defaults to `linear` when omitted on an axis.
 */
declare type ScaleType = 'linear' | 'log' | 'time';

declare interface ScatterColorEncoding {
    /** Absolute data column index. Column 0 is the default X column. */
    dataIndex: number;
    /**
     * `auto` treats low-cardinality integer columns as categories and
     * otherwise uses a continuous ramp. Default: `auto`.
     */
    type?: ScatterColorEncodingType;
    /** Internal stable category codes supplied by row preparation. */
    categoryValues?: readonly number[];
    /** Palette/ramp override for this encoding. */
    palette?: string[];
    /** Numeric domain for continuous/diverging encodings. */
    domain?: [number, number];
    /** Colour for NaN/missing values. Default: the series colour. */
    nullColor?: string;
    /** Tooltip label for this encoded field. */
    label?: string;
    /** Tooltip formatter for this encoded field. */
    format?: (value: number) => string;
}

/**
 * How a `colorBy` column is interpreted. `auto` treats low-cardinality
 * integer columns as categories and everything else as a continuous ramp.
 */
declare type ScatterColorEncodingType = 'auto' | 'category' | 'continuous' | 'diverging';

/** Mark glyph for non-density scatter rendering. Defaults to `circle`. */
declare type ScatterPointShape = 'circle' | 'square' | 'diamond';

/**
 * Scatter draw path. `points` always draws individual marks; `density`
 * always draws a binned heatmap; `auto` (the default) draws points until the
 * visible count crosses the internal density threshold, then switches.
 */
declare type ScatterRenderMode = 'points' | 'density' | 'auto';

declare interface ScatterSizeEncoding {
    /** Absolute data column index. Column 0 is the default X column. */
    dataIndex: number;
    /** Numeric input domain. Defaults to the visible data extent. */
    domain?: [number, number];
    /** Radius range in CSS pixels. Default: [2, 7]. */
    range?: [number, number];
    /** `sqrt` is useful when the encoded value represents area/count. */
    scale?: 'linear' | 'sqrt';
    /** Tooltip label for this encoded field. */
    label?: string;
    /** Tooltip formatter for this encoded field. */
    format?: (value: number) => string;
}

declare interface ScatterTooltipField {
    /** Absolute data column index whose value is shown for the hovered point. */
    dataIndex: number;
    /** Row label in the tooltip. Defaults to `column N`. */
    label?: string;
    /** Value formatter. Defaults to the number's default string form. */
    format?: (value: number) => string;
}

/** A single scatter point captured inside a box selection. */
declare interface SelectedPoint<TMeta = unknown> {
    /** Index of the owning series in `ChartConfig.series`. */
    seriesIndex: number;
    /** Row index into the series' columns. */
    dataIndex: number;
    /** The owning series' `label`. */
    label: string;
    /** Data-space X value of the point. */
    x: number;
    /** Data-space Y value of the point. */
    y: number;
    /** Resolved mark color, ready to paint (respects `colorBy`). */
    color: string;
    /** The owning series' `meta`, passed through for app-level lookups. */
    meta?: TMeta;
}

declare interface SelectionConfig {
    /**
     * Callback fired after a box-select gesture resolves (mouse drag /
     * double-tap + drag on touch by default). The `x` range is always set; `y` is
     * only present when the selection tracked both axes.
     */
    onSelect?: (selection: SelectionResult) => void;
    /**
     * What a box-select gesture does. `zoom` (the default) zooms the viewport
     * to the box, preserving prior behavior. `brush` instead leaves a
     * persistent X-range band drawn as chart state: drag to create it, drag
     * inside to move it, drag an edge to resize it. Read it with
     * `getSelection()`, set it with `setSelection()`, and observe changes via
     * the `selection:change` event. Wheel still zooms and shift-drag still
     * pans in brush mode.
     */
    mode?: 'zoom' | 'brush';
    /**
     * How a persistent brush reacts when data is replaced or a rolling stream
     * evicts its range. Default: `'clear-if-outside'`, which preserves useful
     * selections but clears stale state with no overlap. `'clamp'` intersects
     * the selection with the new X extent; `'clear'` always resets it;
     * `'preserve'` retains the previous behavior.
     */
    dataChange?: 'clear-if-outside' | 'clamp' | 'clear' | 'preserve';
    /**
     * Callback fired whenever the persistent brush selection changes (create,
     * move, resize, programmatic set, or clear). `null` means the selection
     * was cleared. Mirrors the `selection:change` event.
     */
    onBrush?: (selection: SelectionRange | null) => void;
}

/**
 * A persistent brush selection in data space, safe to serialize (e.g. into a
 * URL). `x` is always present; `y` is reserved for a future 2D brush.
 */
declare interface SelectionRange {
    x: ScaleRange;
    y?: ScaleRange;
}

/**
 * A persistent brush selection in data space, safe to serialize (e.g. into a
 * URL). `x` is always present; `y` is reserved for a future 2D brush.
 */
declare interface SelectionRange_2 {
    x: ScaleRange_2;
    y?: ScaleRange_2;
}

declare interface SelectionResult<TMeta = unknown> {
    /** Selected X domain. Always present. */
    x: ScaleRange;
    /** Selected Y domain. Present only when the gesture tracked both axes. */
    y?: ScaleRange;
    /** Populated for visible scatter series when the selection spans both axes. */
    points?: SelectedPoint<TMeta>[];
}

declare interface SelectionResult_2<Row = Record<string, unknown>> extends SelectionRange {
    points?: readonly ChartPoint<Row>[];
}

declare interface SeriesBase<Row> extends Omit<SeriesConfig, 'type' | 'label' | 'dataIndex' | 'xDataIndex' | 'yDataIndex' | 'upperDataIndex' | 'lowerDataIndex' | 'xAxisKey' | 'yAxisKey' | 'colorBy' | 'sizeBy' | 'tooltipFields' | 'fill' | 'visible' | 'heatmap'> {
    /** Inferred from a unique Y field; required for computed or ambiguous series. */
    id?: string;
    label?: string;
    data?: DataSource<Row>;
    x?: Accessor<Row, AxisValue>;
    rowId?: Accessor<Row, RowId>;
    xAxis?: string;
    yAxis?: string;
    format?: (value: number, point?: ChartPoint<Row>) => string;
    fill?: string | null | ((value: number, rowIndex: number, row?: Row) => string);
}

declare interface SeriesConfig<TMeta = unknown> {
    /** Chart type for this series */
    type?: ChartType;
    /** Display label */
    label: string;
    /**
     * Primary value column in `ColumnarData`.
     * Required for line, area, band, bar, and histogram series. Scatter series
     * should prefer `yDataIndex`, with `dataIndex` kept as a fallback alias.
     */
    dataIndex?: number;
    /**
     * Line / mark outline color (any CSS color). Defaults to the theme's
     * categorical palette entry for this series' index.
     */
    stroke?: string;
    /**
     * Area / bar fill color. `null` forces no fill (useful to draw an
     * `area` series as a bare outline). Defaults to a translucent `stroke`
     * for areas and the series color for bars.
     *
     * Bar series also accept a per-datum callback `(value, index) => color`
     * for emphasis patterns like highlighting the most recent bar:
     *
     * ```ts
     * fill: (v, i) => i === data[0].length - 1 ? '#e8590c' : '#4f8fea'
     * ```
     *
     * Callbacks are honored by bar series only; other series types fall
     * back to their default fill.
     */
    fill?: string | null | ((value: number, index: number) => string);
    /** Stroke width in CSS pixels. Default: 1.5. Applies to line and area outlines. */
    lineWidth?: number;
    /**
     * Radius in CSS pixels for scatter marks and cursor indicators. Scatter's
     * auto styling shrinks the effective radius for very dense clouds; set this
     * to pin a fixed size.
     */
    pointRadius?: number;
    /**
     * Mark opacity, 0 to 1. Defaults are type-specific (line/area outline 1,
     * bar 0.75, histogram 0.75, band fill 0.15). Multiplied by highlight dimming.
     */
    opacity?: number;
    interpolation?: InterpolationMode;
    /**
     * Bridge missing values (NaN) with a connecting line instead of breaking
     * the path. Default: `false`, NaN creates a visible gap. Useful when
     * gaps mean "not sampled" (multi-run data joined onto a shared X column,
     * missed scrapes) rather than "no signal". Applies to line and area
     * series across every interpolation mode.
     */
    spanGaps?: boolean;
    /**
     * Dash pattern for line strokes, following the Canvas `setLineDash()` spec.
     * Array of segment lengths alternating between dash and gap (e.g. `[6, 3]`
     * for a 6px dash with 3px gap). `undefined` or `[]` renders a solid line.
     *
     * Applied to both line and area outline strokes.
     *
     * @example
     * ```ts
     * { lineDash: [6, 3] }       // standard dash
     * { lineDash: [2, 2] }       // dotted
     * { lineDash: [10, 4, 2, 4] } // dash-dot
     * ```
     */
    lineDash?: number[];
    /**
     * Vertical fill gradient for `area` series, `top` at the line, `bottom`
     * at the baseline. Overrides `fill`. Each stop is a full CSS color
     * including its own alpha. Default: a translucent `stroke` ramp.
     */
    fillGradient?: {
        top: string;
        bottom: string;
    };
    /**
     * Column index for the upper bound of a `type: 'band'` series.
     * Required when `type` is `'band'`. Ignored for other chart types.
     */
    upperDataIndex?: number;
    /**
     * Column index for the lower bound of a `type: 'band'` series.
     * Required when `type` is `'band'`. Ignored for other chart types.
     *
     * A band series renders three elements as a single visual unit:
     * 1. Filled region between `upperDataIndex` and `lowerDataIndex`
     * 2. Center line at `dataIndex` (used for tooltip values and cursor snapping)
     *
     * @example
     * ```ts
     * // data = [x, yMean, yUpper, yLower]
     * series: [
     *   { label: 'Loss', type: 'band', dataIndex: 1,
     *     upperDataIndex: 2, lowerDataIndex: 3,
     *     stroke: '#4f8fea', fill: '#4f8fea', opacity: 0.15 },
     * ]
     * ```
     */
    lowerDataIndex?: number;
    /** Fraction of the category width each bar occupies (0–1). Default 0.8. */
    barWidthRatio?: number;
    /**
     * Absolute column index for scatter X values. Defaults to column 0.
     * Useful for tabular datasets where several scatter views share the same
     * row identity but use different X/Y metric columns.
     */
    xDataIndex?: number;
    /** Absolute column index for scatter Y values. Preferred over `dataIndex`. */
    yDataIndex?: number;
    /** Preferred scatter render path. `auto` uses points until the density threshold. */
    renderMode?: ScatterRenderMode;
    /** Point shape for non-density scatter rendering. Default: 'circle'. */
    pointShape?: ScatterPointShape;
    /** Colour points by a categorical or numeric column. */
    colorBy?: number | ScatterColorEncoding;
    /** Size points by a numeric column. */
    sizeBy?: number | ScatterSizeEncoding;
    /** Extra columns to show in the default nearest-point tooltip. */
    tooltipFields?: Array<number | ScatterTooltipField>;
    /** Force heatmap (density) rendering for scatter plots regardless of point count */
    heatmap?: boolean;
    /** Heatmap bin size in CSS pixels (default: 1 = one bin per physical pixel) */
    heatmapBinSize?: number;
    /**
     * Density-to-colour ramp for heatmap rendering. Array of 2+ hex colours
     * interpolated linearly in sRGB; `t = 0` → first stop, `t = 1` → last.
     * Overrides `theme.heatmapGradient`, then `theme.sequentialPalette`.
     */
    heatmapGradient?: string[];
    /** Key of the X axis in `ChartConfig.axes` this series maps onto. Defaults to `'x'`. */
    xAxisKey?: string;
    /**
     * Key of the Y axis this series maps onto. Defaults to `'y'`. Point a
     * second series at a different key (e.g. `'y2'`) for a dual-axis chart.
     */
    yAxisKey?: string;
    /**
     * Whether the series is drawn and included in auto-range. Default: `true`.
     * Toggling this (e.g. from a legend) preserves the series' config and
     * highlight state; a hidden series still occupies its `seriesIndex`.
     */
    visible?: boolean;
    /**
     * Free-form per-series metadata for app-level data
     * (e.g. `{ runId, metricKey }` for ML dashboards). Surfaced in
     * `CursorSeriesPoint.meta` and to legend column renderers.
     * Generic so consumers get type inference end-to-end.
     */
    meta?: TMeta;
}

export declare function SeriesLegend<Row>(props: SeriesLegendProps<Row>): DetailedReactHTMLElement<    {
ref: RefObject<HTMLDivElement | null>;
className: string;
style: CSSProperties | undefined;
role: "group";
'aria-label': string;
}, HTMLDivElement>;

export declare interface SeriesLegendProps<Row = Record<string, unknown>> {
    chart: ChartHandle<Row> | null | undefined;
    toggle?: boolean;
    highlight?: boolean;
    className?: string;
    style?: CSSProperties;
}

declare type SeriesOptions<Row> = (SeriesBase<Row> & {
    type?: 'line' | 'area' | 'bar';
    y: Numeric<Row>;
}) | (SeriesBase<Row> & {
    type: 'band';
    y: Numeric<Row>;
    lower: Numeric<Row>;
    upper: Numeric<Row>;
}) | (SeriesBase<Row> & {
    type: 'scatter';
    y: Numeric<Row>;
    colorBy?: ColorEncoding<Row>;
    sizeBy?: SizeEncoding<Row>;
    tooltipFields?: readonly TooltipField<Row>[];
}) | (SeriesBase<Row> & {
    type: 'histogram';
    id: string;
    data: HistogramBins;
});

declare type SizeEncoding<Row> = Numeric<Row> | (Omit<ScatterSizeEncoding, 'dataIndex'> & {
    field: Numeric<Row>;
});

declare interface StreamingConfig {
    /**
     * Retain at most this many points after appendData(). When set, snaplot
     * uses an internal ring buffer so streaming updates do not allocate a new
     * full-window dataset on every tick.
     */
    maxLen?: number;
    /**
     * Live-follow window width in X data units. When set and the chart is
     * "following" (the default until the user pans or zooms X), each
     * `appendData` keeps the X viewport at `[latestX - follow, latestX]`, so
     * the view scrolls with the newest data. Panning or zooming X pauses
     * following; `chart.scrollToLatest()` or a double-click reset resumes it.
     * Without this, a following chart tracks the full data extent instead of a
     * fixed trailing window. Follows the default `x` axis (and any horizontal
     * axis).
     */
    follow?: number;
}

/** Native React cells; no DOM nodes are constructed while rendering. */
export declare function swatchColumn<Row>(options?: {
    size?: number;
    shape?: 'dot' | 'bar';
}): LegendTableColumn<Row>;

/**
 * Chart color and typography tokens.
 *
 * Every color field accepts any CSS color the browser can compute,
 * including `var(--token)` references and `oklch(...)`: values are
 * resolved against the chart container when the theme is applied, and
 * re-resolved automatically when the document theme changes (an attribute
 * flip on `<html>`/`<body>` or an OS color-scheme change), so charts in a
 * CSS-variable design system re-theme live with no remount. Alternatively
 * define the `--chart-*` custom properties (see `CHART_CSS_VARS`) on the
 * container and omit `theme` entirely.
 */
declare interface ThemeConfig {
    /**
     * Plot background fill. The grid canvas is opaque, so this must resolve to
     * a solid color. Theme overrides may use the special value `'container'`
     * to copy the nearest non-transparent ancestor background color.
     */
    backgroundColor: string;
    /** Primary text color for DOM companions. Axis text uses axisLabelColor when set. */
    textColor: string;
    /** Shared axis title and tick-label color. Built-in themes use the muted text color. */
    axisLabelColor?: string;
    /** CSS font stack for all axis and tooltip text. */
    fontFamily: string;
    /** Base text size in CSS pixels. Built-in themes use 11. */
    fontSize: number;
    /** Gridline hue. Combined with gridOpacity. Built-in frames share this hue and opacity. */
    gridColor: string;
    /** Gridline opacity, 0 to 1. Kept low so lines sit beneath the data. */
    gridOpacity: number;
    /**
     * Legacy and fallback series colour cycle. Kept as the primary API for
     * compatibility; new themes should treat it as the categorical palette.
     */
    palette: string[];
    /**
     * Optional categorical series colour cycle for unordered/discrete series
     * such as lines, grouped bars, and multiple scatter categories.
     * Falls back to `palette`.
     */
    categoricalPalette?: string[];
    /**
     * Optional ordered magnitude ramp for density/continuous encodings.
     * Used by heatmap scatter rendering when `heatmapGradient` is not set.
     */
    sequentialPalette?: string[];
    /** Optional signed/centered-data ramp for future diverging encodings. */
    divergingPalette?: string[];
    /** Optional default density ramp for heatmap scatter series. */
    heatmapGradient?: string[];
    /** Color of the axis baseline strokes (distinct from gridlines). */
    axisLineColor: string;
    /**
     * Plot-area frame. Kept separate from `axisLineColor` so you can tune
     * the rectangle around the plot without touching axis ticks. Built-in
     * themes use the same hue and opacity as the grid.
     */
    borderColor: string;
    /**
     * Opacity of the plot-area frame. Intentionally distinct from
     * `gridOpacity` so the border can sit one visual step above the grid
     * while sharing its hue.
     */
    borderOpacity: number;
    /** Muted companion text color. Built-in themes also use this hue for axisLabelColor. */
    tickColor: string;
    /** Default crosshair line color, overridable per chart via `cursor.color`. */
    crosshairColor: string;
    /** Tooltip surface fill. Dark themes use a translucent value for a glass look. */
    tooltipBackground: string;
    /** Tooltip text color. */
    tooltipTextColor: string;
    /** Tooltip border color. */
    tooltipBorderColor: string;
}

declare interface TooltipConfig {
    /** Whether to show the tooltip on hover. Default: `true`. */
    show?: boolean;
    /**
     * Which points to include. `index` (default) shows every series at the
     * snapped X index; `nearest` shows only the single closest point (best for
     * scatter); `x` matches `index` for shared-X series. `index` and `x` are
     * equivalent for line/area/bar data.
     */
    mode?: 'nearest' | 'index' | 'x';
    /** Pixel offset from the cursor. Defaults to TOOLTIP_OFFSET (12 px). */
    offset?: number;
    /**
     * Format the X value shown in the default tooltip (the header in
     * multi-series mode, the `x` readout in nearest mode). Covers the
     * common "nice date, no custom renderer" case; defaults to the X
     * axis's tick formatting. Populates `TooltipPoint.formattedX`.
     */
    xFormat?: (x: number) => string;
    /**
     * Format a histogram interval. When omitted, each edge uses `xFormat` or
     * the X axis tick formatter, so tooltip ranges use the same units and
     * precision as the axis. Populates `TooltipPoint.formattedX`.
     */
    rangeFormat?: (min: number, max: number, seriesIndex: number) => string;
    /**
     * Format each Y value shown in the default tooltip, e.g. to append
     * units. Receives the series index for mixed-unit charts. Defaults to
     * the Y axis's tick formatting. Populates `TooltipPoint.formattedY`.
     */
    yFormat?: (y: number, seriesIndex: number) => string;
    /**
     * Custom renderer. Returning a string sets the tooltip's `innerHTML`
     * verbatim, so escape any user-derived text or return an `HTMLElement`
     * built with `textContent` to avoid an injection hole. Receives the
     * points selected by `mode`.
     */
    render?: (points: TooltipPoint[]) => string | HTMLElement;
}

declare type TooltipField<Row> = Accessor<Row, number | string | null | undefined> | (Omit<ScatterTooltipField, 'dataIndex'> & {
    field: Accessor<Row, number | string | null | undefined>;
});

/** One extra scatter column value in a tooltip row. */
declare interface TooltipFieldValue {
    /** Field label from `ScatterTooltipField.label` (or `column N`). */
    label: string;
    /** Raw value at the point's row. */
    value: number;
    /** Value run through the field's `format`. */
    formatted: string;
}

/** One row passed to a custom `tooltip.render`. */
declare interface TooltipPoint {
    /** Index of the owning series in `ChartConfig.series`. */
    seriesIndex: number;
    /** Row index into the series' columns. */
    dataIndex: number;
    /** The owning series' `label`. */
    label: string;
    /** Raw data-space X value. */
    x: number;
    /** Raw X interval represented by the mark; present for histogram bins. */
    xRange?: ScaleRange;
    /** Raw data-space Y value. */
    y: number;
    /** Resolved mark color for the swatch. */
    color: string;
    /** X value pre-formatted via the x-axis `tickFormat`. */
    formattedX: string;
    /** Y value pre-formatted via the y-axis `tickFormat`. */
    formattedY: string;
    /** Mark radius in CSS pixels; present for scatter points only. */
    radius?: number;
    /** Extra scatter columns requested via `series.tooltipFields`. */
    fields?: TooltipFieldValue[];
}

declare interface TouchConfig {
    /**
     * Global hit-test radius override in CSS pixels. When unset, the chart
     * picks the radius per call from the pointer type: 44 px for touch
     * (WCAG 2.5.5 tap-target minimum) and 32 px for mouse / pen.
     */
    hitRadius?: number;
    /**
     * One-finger drag behavior. Default: `'cursor'`, which moves the cursor
     * and tooltip without changing the viewport. Set to `'pan'` for the old
     * one-finger pan behavior.
     */
    drag?: 'cursor' | 'pan';
    /**
     * Touch gesture for box selection. Default: `'double-tap-drag'`.
     * When `drag: 'pan'`, the default becomes `'none'` so ordinary pan
     * gestures are not mistaken for selections. Set to `'double-tap-drag'`
     * explicitly to combine touch panning with touch selection.
     */
    selectionGesture?: 'double-tap-drag' | 'long-press' | 'none';
    /** Long-press duration in ms before box selection activates. */
    longPressMs?: number;
}

/** Options are fixed for this group's lifetime. Create a new owner to change them. */
export declare function useChartGroup(options?: ChartGroupOptions): ChartGroup_2;

export declare function useChartState<Row>(chart: ChartHandle<Row> | null | undefined): ChartState_2<Row> | undefined;

export declare function useCursorSnapshot<Row>(chart: ChartHandle<Row> | null | undefined, options?: CursorSnapshotOptions): CursorSnapshot_2<Row> | undefined;

export declare function useHighlight<Row>(chart: ChartHandle<Row> | null | undefined): readonly [string | null, (id: string | null) => void | undefined];

export declare function valueColumn<Row>(options?: {
    format?: (value: number, point: ChartPoint<Row>) => string;
    placeholder?: string;
    align?: 'left' | 'right' | 'center';
    header?: string;
}): LegendTableColumn<Row>;

declare type Viewport = Record<string, ScaleRange>;

declare type Viewport_2 = Record<string, ScaleRange_2>;

/**
 * Per-axis bounds for zoom and pan. `'data'` tracks the current data
 * extent; an explicit `{ min?, max? }` pins custom limits (use
 * `undefined` on one side for half-open bounds).
 */
declare type ZoomBoundsSpec = 'data' | 'unbounded' | {
    min?: number;
    max?: number;
};

declare interface ZoomConfig {
    /** Master switch for all zoom gestures. Default: `true`. */
    enabled?: boolean;
    /** Allow zooming the X axis. Default: `true`. */
    x?: boolean;
    /**
     * Allow zooming the Y axis. Default: `false`; time-series charts usually
     * pin Y to auto-range. Enable for the `analytical` 2D-zoom experience.
     */
    y?: boolean;
    /** Enable wheel/pinch zoom gestures that start over axis gutters. Default: `false`. */
    axis?: boolean;
    /**
     * Zoom fraction per maximum wheel / pinch tick. 0 disables wheel zoom;
     * 0.1 (the default) scales by up to 10% per tick; 0.3 is aggressive.
     * Replaces the previous `wheelFactor` whose "1.0" meant "1x = no zoom",
     * which was easy to misread.
     */
    wheelStep?: number;
    /**
     * Touch pinch behavior when both `zoom.x` and `zoom.y` are enabled.
     * Default: `'xy'`, apply a uniform map/image-style 2D zoom. Set to
     * `'axis-lock'` to infer X-only or Y-only zoom from the pinch direction.
     */
    pinchMode?: 'xy' | 'axis-lock';
    /**
     * Smallest allowed X domain span (data units), the tightest zoom-in.
     * Prevents zooming past a meaningful resolution. Unset: no lower limit.
     */
    minRange?: number;
    /**
     * Largest allowed X domain span (data units), the widest zoom-out.
     * Independent of `bounds`, which constrains position rather than span.
     */
    maxRange?: number;
    /**
     * Constrains pan + zoom so the viewport cannot escape the data (or a
     * custom range). Applied on every viewport change, pan past the edge
     * stops at the edge, zoom-out stops at the full extent.
     *
     * - `true` (default) → shorthand for `{ x: 'data', y: 'data' }`.
     * - `false` / `'unbounded'` → no clamping, classic infinite zoom/pan.
     * - Per-axis: `{ x: 'data' }` or `{ x: { min, max }, y: 'unbounded' }`.
     *
     * Axes not mentioned fall back to the top-level default.
     */
    bounds?: boolean | ZoomBoundsSpec | {
        x?: ZoomBoundsSpec;
        y?: ZoomBoundsSpec;
    };
    /**
     * Called after the X viewport changes from a zoom or pan, with the new
     * data-space bounds. Fires per settled change, not per animation frame.
     * For non-X changes use the `viewport:change` event.
     */
    onZoom?: (xMin: number, xMax: number) => void;
}

export { }
