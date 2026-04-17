import HeroDashboard from '../components/HeroDashboard';

/**
 * /demos route — the dashboard takes over the whole page surface so
 * the selected theme reads edge-to-edge. HeroDashboard owns the
 * CSS-var rewrite, heading, chip row and panel grid; this route is
 * just the entry point so Home and Docs stay on the site's default
 * light/dark palette.
 */
export default function Demos() {
  return <HeroDashboard />;
}
