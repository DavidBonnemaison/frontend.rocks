import { mountLabFrame } from './lab-frame';
import { mountExperimentFrame, type MountedFrame, type MountRequest } from './mount';

export function mountForBundle(
  host: HTMLElement,
  req: MountRequest & { labOrigin?: string }
): Promise<MountedFrame> {
  if (req.bundle.host === 'origin') {
    return mountLabFrame(host, req);
  }
  return mountExperimentFrame(host, req);
}
