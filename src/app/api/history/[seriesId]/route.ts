import type { NextRequest } from "next/server";
import { getSlateResult } from "@/lib/yahoo";

export const maxDuration = 60;

const MAX_CONTESTS = 200;

export async function GET(req: NextRequest, ctx: RouteContext<"/api/history/[seriesId]">) {
  const { seriesId } = await ctx.params;
  const id = Number(seriesId);
  const contestIds = [
    ...new Set(
      (req.nextUrl.searchParams.get("contests") ?? "")
        .split(",")
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];

  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Invalid slate id" }, { status: 400 });
  }
  if (!contestIds.length || contestIds.length > MAX_CONTESTS) {
    return Response.json({ error: `Provide 1–${MAX_CONTESTS} contest ids` }, { status: 400 });
  }

  try {
    return Response.json(await getSlateResult(id, contestIds));
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not load slate results from Yahoo" }, { status: 502 });
  }
}
