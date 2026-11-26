export interface NightlyStep {
  name: string;
  script: string;
  env: 'content' | 'verifier';
  days?: number[];
  optional?: boolean;
}

export const NIGHTLY_STEPS: NightlyStep[] = [];
