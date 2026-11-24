import { analyzeDiagnosticPayload } from './analyze';
import type { DiagnoseWorkerRequest, DiagnoseWorkerResponse } from './types';

self.onmessage = (event: MessageEvent<DiagnoseWorkerRequest>) => {
  const { id, fileName, rawText, fileSizeBytes } = event.data;
  try {
    const result = analyzeDiagnosticPayload(rawText, fileName, fileSizeBytes);
    const response: DiagnoseWorkerResponse = { id, ok: true, result };
    self.postMessage(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to analyze diagnostic file.';
    const response: DiagnoseWorkerResponse = { id, ok: false, error: message };
    self.postMessage(response);
  }
};
