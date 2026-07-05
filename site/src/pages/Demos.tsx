import HeroDashboard from '../components/HeroDashboard';
import FeatureDemos from '../components/FeatureDemos';

/**
 * /demos route. The dashboard leads and fills the first screen so the
 * selected theme reads across the main workspace; a compact strip of
 * per-feature demos follows below the fold. Focused renderer edge-case
 * fixtures stay on the separate #/visual route.
 */
export default function Demos() {
  return (
    <>
      <HeroDashboard />
      <FeatureDemos />
    </>
  );
}
