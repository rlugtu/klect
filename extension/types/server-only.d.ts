// web's server modules begin with `import "server-only"` (a Next.js runtime guard that
// throws if they are bundled client-side). The extension only follows their *types*, via
// the type-only tRPC `AppRouter` import in src/shared/api-types.ts, so this ambient stub
// satisfies tsc without the package. Same stub mobile carries (mobile/types/server-only.d.ts).
declare module "server-only";
