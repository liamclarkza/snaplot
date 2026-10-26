// The chart scenario #21 renders on the server and hydrates in the browser (plan §7.5): plain
// data, so the server render and the page can share it.
export const SSR_PROPS = {
  data: Array.from({ length: 40 }, (_, t) => ({ t, cpu: t, mem: 50 + ((t * 7) % 11) })),
  x: 't',
  series: [
    { y: 'cpu', label: 'CPU' },
    { y: 'mem', label: 'Memory' },
  ],
};
