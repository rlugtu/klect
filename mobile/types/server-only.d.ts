// web's server modules begin with `import "server-only"` (a Next.js runtime guard
// that throws if bundled client-side). Mobile only follows their *types* via the
// tRPC AppRouter import, so this ambient stub satisfies tsc without the package.
declare module "server-only";
