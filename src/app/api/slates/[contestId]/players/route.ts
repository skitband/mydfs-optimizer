import type { NextRequest } from "next/server";
import { getContestPlayers } from "@/lib/yahoo";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/slates/[contestId]/players">) {
  const { contestId } = await ctx.params;
  const id = Number(contestId);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Invalid contest id" }, { status: 400 });
  }
  try {
    return Response.json(await getContestPlayers(id));
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not load players from Yahoo" }, { status: 502 });
  }
}
