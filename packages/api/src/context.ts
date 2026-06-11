import { auth } from "@canvas-v5/auth";

export async function createContext({ req }: { req: Request }) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  return {
    auth: null,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
