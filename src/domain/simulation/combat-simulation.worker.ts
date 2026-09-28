import { runCombatSimulations, type SimulationInput, type SimulationBatchResult } from "./combat-simulation";

type SimulationWorkerRequest = { input: SimulationInput; runs: number };

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  const { input, runs } = event.data;
  const result: SimulationBatchResult = runCombatSimulations(input, runs);
  self.postMessage(result);
};

export {};
