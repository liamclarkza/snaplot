/** A stylesheet imported as text (`?inline`), which the legends inject once per document. */
declare module '*.css?inline' {
  const css: string;
  export default css;
}
