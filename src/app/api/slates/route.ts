import { connection } from "next/server";
import { getSlates } from "@/lib/yahoo";

export async function GET() {
  await connection();
  try {
    return Response.json(await getSlates());
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not load slates from Yahoo" }, { status: 502 });
  }
}
