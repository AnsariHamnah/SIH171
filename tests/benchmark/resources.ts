export interface ResourceMeasurement {
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  rssMb: number;
  arrayBuffersMb: number;
}

export function getResourceMeasurement(): ResourceMeasurement {
  const mem = process.memoryUsage();
  return {
    heapUsedMb: mem.heapUsed / 1024 / 1024,
    heapTotalMb: mem.heapTotal / 1024 / 1024,
    externalMb: mem.external / 1024 / 1024,
    rssMb: mem.rss / 1024 / 1024,
    arrayBuffersMb: mem.arrayBuffers / 1024 / 1024,
  };
}

export function formatResourceMeasurement(measurement: ResourceMeasurement): string {
  return `heap: ${measurement.heapUsedMb.toFixed(2)}MB / ${measurement.heapTotalMb.toFixed(2)}MB, external: ${measurement.externalMb.toFixed(2)}MB, rss: ${measurement.rssMb.toFixed(2)}MB`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export async function getSystemInfo(): Promise<{
  platform: string;
  arch: string;
  nodeVersion: string;
  cpus: number;
  totalMemoryGb: number;
}> {
  const os = await import('os');
  const totalMem = os.totalmem();
  const cpus = os.cpus().length;
  
  return {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    cpus,
    totalMemoryGb: Math.round(totalMem / 1024 / 1024 / 1024 * 100) / 100,
  };
}