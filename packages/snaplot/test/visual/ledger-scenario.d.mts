/** One commit of a ledger scenario. */
export interface LedgerCommit {
  subject: string;
  /** The commit body, e.g. a `visual: V31` paragraph. */
  body?: string;
  /** Files written before the commit, by path from the repository root. */
  files: Record<string, string>;
}

export interface LedgerScenario {
  /** Commits made in order on top of the base commit (which holds V0.md). */
  commits: LedgerCommit[];
}

/** Runs scripts/overhaul/check-visual-ledger.mjs over the scenario's commits. */
export function runLedgerScenario(scenario: LedgerScenario): {
  status: number | null;
  output: string;
};
