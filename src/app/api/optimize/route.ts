import { OptimizeInputError, optimize, parseOptimizeRequest } from "@/lib/optimizer";

export const maxDuration = 60;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  try {
    return Response.json(await optimize(parseOptimizeRequest(body)));
  } catch (err) {
    if (err instanceof OptimizeInputError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return Response.json({ error: "Optimizer failed" }, { status: 500 });
  }
}
