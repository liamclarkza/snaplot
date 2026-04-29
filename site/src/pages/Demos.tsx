import HeroDashboard from '../components/HeroDashboard';

/**
 * /demos route, the dashboard takes over the whole page surface so
 * the selected theme reads across the main demo workspace. Focused
 * renderer edge-case fixtures stay out of the public demos route.
 */
export default function Demos() {
  return <HeroDashboard />;
}
