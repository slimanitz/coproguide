/**
 * Plain ESM config (not next.config.ts) so that `next start` in the production image needs no
 * TypeScript toolchain: devDependencies are pruned from the runtime stage.
 * @type {import("next").NextConfig}
 */
const nextConfig = {
  // Native / heavy server-only packages must not be bundled by webpack.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp", "postgres"],
  poweredByHeader: false,
};

export default nextConfig;
