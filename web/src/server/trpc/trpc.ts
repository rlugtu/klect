import "server-only";
import { initTRPC, TRPCError, type TRPCDefaultErrorShape } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { auth } from "@/lib/auth";
import {
  isFreeLimitError,
  toFreeLimitResult,
  type FreeLimitError,
  type FreeLimitResult,
} from "@/lib/core/entitlements";

/**
 * tRPC context. The API is the surface the mobile app consumes; auth is resolved
 * from the better-auth session on the incoming request (same server as web).
 */
export async function createContext({ req }: FetchCreateContextFnOptions) {
  const session = await auth.api.getSession({ headers: req.headers });
  return { user: session?.user ?? null };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

/**
 * The error shape mobile receives: tRPC's default, plus `data.freeLimit` on the
 * one error the client has to react to differently rather than just report.
 *
 * Optional rather than a union of two shapes, so `error.data.freeLimit` is
 * readable on the client without narrowing first, and so every other error's
 * payload is byte-for-byte what it was before this existed.
 */
export type KlectErrorShape = TRPCDefaultErrorShape & {
  data: TRPCDefaultErrorShape["data"] & { freeLimit?: FreeLimitResult };
};

/**
 * Dig a `FreeLimitError` out of whatever tRPC hands the formatter.
 *
 * It arrives wrapped: a throw that isn't a `TRPCError` gets wrapped in one with
 * the original as `cause`, and a procedure that deliberately converts it (say
 * to a FORBIDDEN `TRPCError`) also passes it as `cause`. Walking the chain
 * covers both without the formatter caring which the router chose. The depth
 * cap only guards against a self-referencing `cause`.
 */
function findFreeLimitError(error: unknown): FreeLimitError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if (isFreeLimitError(current)) return current;
    current = current.cause;
  }
  return null;
}

const t = initTRPC.context<Context>().create({
  /**
   * Attaches the structured free-tier refusal to `data.freeLimit` so mobile can
   * branch on a cap hit instead of matching the error message text. Every other
   * error passes through tRPC's default shape untouched.
   */
  errorFormatter({ shape, error }): KlectErrorShape {
    const freeLimit = findFreeLimitError(error);
    if (!freeLimit) return shape;

    return {
      ...shape,
      data: { ...shape.data, freeLimit: toFreeLimitResult(freeLimit) },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

/** Requires a signed-in user; narrows `ctx.user` to non-null for downstream. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in required." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
