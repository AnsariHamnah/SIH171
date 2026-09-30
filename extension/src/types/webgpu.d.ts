// WebGPU type declarations for TypeScript
interface GPU {
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): GPUTextureFormat;
}

interface GPURequestAdapterOptions {
  powerPreference?: 'low-power' | 'high-performance';
  forceFallbackAdapter?: boolean;
}

interface GPUAdapter {
  requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
  name: string;
  isFallbackAdapter: boolean;
}

interface GPUDeviceDescriptor {
  label?: string;
  requiredFeatures?: GPUFeatureName[];
  requiredLimits?: GPUSupportedLimits;
}

interface GPUDevice {
  name: string;
  features: GPUSupportedFeatures;
  limits: GPUSupportedLimits;
  queue: GPUQueue;
  destroy(): void;
}

interface GPUQueue {
  submit(commandBuffers: GPUCommandBuffer[]): void;
  onsubmittedworkdone: Promise<void>;
}

interface GPUSupportedFeatures {
  has(feature: GPUFeatureName): boolean;
  [Symbol.iterator](): IterableIterator<GPUFeatureName>;
}

interface GPUSupportedLimits {
  get(limit: GPULimitName): number;
}

type GPUFeatureName = string;
type GPULimitName = string;

interface GPUBufferDescriptor {
  label?: string;
  size: number;
  usage: GPUBufferUsageFlags;
  mappedAtCreation?: boolean;
}

interface GPUBuffer {
  size: number;
  usage: GPUBufferUsageFlags;
  mapState: GPUBufferMapState;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

type GPUTextureFormat = string;
type GPUTextureUsageFlags = number;
type GPUBufferUsageFlags = number;
type GPUBufferMapState = 'unmapped' | 'pending' | 'mapped';
type GPUShaderModuleDescriptor = { code: string; label?: string };
type GPUPipelineLayoutDescriptor = { label?: string; bindGroupLayouts: GPUBindGroupLayout[] };
type GPUBindGroupLayoutDescriptor = { label?: string; entries: GPUBindGroupLayoutEntry[] };
type GPUBindGroupLayoutEntry = { binding: number; visibility: number; buffer?: GPUBufferBindingLayout; sampler?: GPUSamplerBindingLayout; texture?: GPUTextureBindingLayout; storageTexture?: GPUStorageTextureBindingLayout };
type GPUBufferBindingLayout = { type?: 'uniform' | 'storage' | 'read-only-storage'; hasDynamicOffset?: boolean; minBindingSize?: number };
type GPUSamplerBindingLayout = { type?: 'filtering' | 'non-filtering' | 'comparison' };
type GPUTextureBindingLayout = { sampleType?: 'float' | 'unfilterable-float' | 'depth' | 'sint' | 'uint'; viewDimension?: '1d' | '2d' | '2d-array' | 'cube' | 'cube-array'; multisampled?: boolean };
type GPUStorageTextureBindingLayout = { access?: 'write-only' | 'read-only' | 'read-write'; format?: GPUTextureFormat; viewDimension?: '1d' | '2d' | '2d-array' | '3d' };
type GPUBindGroupDescriptor = { label?: string; layout: GPUBindGroupLayout; entries: GPUBindGroupEntry[] };
type GPUBindGroupEntry = { binding: number; resource: GPUBindingResource };
type GPUBindingResource = GPUBufferBinding | GPUSampler | GPUTextureView;
type GPUBufferBinding = { buffer: GPUBuffer; offset?: number; size?: number };
type GPUSamplerDescriptor = { label?: string; addressModeU?: 'clamp-to-edge' | 'repeat' | 'mirror-repeat'; addressModeV?: 'clamp-to-edge' | 'repeat' | 'mirror-repeat'; addressModeW?: 'clamp-to-edge' | 'repeat' | 'mirror-repeat'; magFilter?: 'nearest' | 'linear'; minFilter?: 'nearest' | 'linear'; mipmapFilter?: 'nearest' | 'linear'; lodMinClamp?: number; lodMaxClamp?: number; compare?: 'never' | 'less' | 'equal' | 'less-equal' | 'greater' | 'not-equal' | 'greater-equal' | 'always'; maxAnisotropy?: number };

type GPUSampler = unknown;
type GPUCommandEncoder = unknown;
type GPUCommandBufferDescriptor = { label?: string };
type GPUCommandBuffer = unknown;
type GPURenderBundleEncoder = unknown;
type GPUQuerySetDescriptor = { label?: string; type: 'occlusion'; count: number };
type GPUQuerySet = unknown;
type GPUShaderModule = unknown;
type GPUComputePipeline = unknown;
type GPURenderPipeline = unknown;
type GPUPipelineLayout = unknown;
type GPUBindGroupLayout = unknown;
type GPUTextureViewDescriptor = { label?: string; format?: GPUTextureFormat; dimension?: '1d' | '2d' | '2d-array' | 'cube' | 'cube-array' | '3d'; aspect?: 'all' | 'stencil-only' | 'depth-only'; baseMipLevel?: number; mipLevelCount?: number; baseArrayLayer?: number; arrayLayerCount?: number; };
type GPUTextureView = unknown;
type GPUImageCopyTexture = { texture: GPUTexture; mipLevel?: number; origin?: GPUOrigin3D; aspect?: GPUTextureAspect };
type GPUOrigin3D = { x?: number; y?: number; z?: number };
type GPUTextureAspect = 'all' | 'stencil-only' | 'depth-only';
type GPUImageCopyExternalImage = { source: ImageBitmap | HTMLCanvasElement | OffscreenCanvas; origin?: GPUOrigin2D; flipY?: boolean };
type GPUOrigin2D = { x?: number; y?: number };
type GPUImageDataLayout = { offset?: number; bytesPerRow: number; rowsPerImage?: number };
type GPUErrorFilter = 'out-of-memory' | 'validation' | 'internal';
type GPUUncapturedErrorEvent = { error: GPUError };
type GPUError = { message: string; };
type GPUDeviceLostInfo = { reason: 'destroyed' | 'unknown'; message: string; };
type GPUDeviceLostReason = 'destroyed' | 'unknown';

interface GPUTexture {
  width: number;
  height: number;
  depthOrArrayLayers: number;
  mipLevelCount: number;
  sampleCount: number;
  dimension: GPUTextureDimension;
  format: GPUTextureFormat;
  usage: GPUTextureUsageFlags;
  createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView;
  destroy(): void;
}

type GPUTextureDimension = '1d' | '2d' | '3d';

interface Navigator {
  readonly gpu?: GPU;
}

interface Window {
  readonly isSecureContext: boolean;
}

type GPUPowerPreference = 'low-power' | 'high-performance';