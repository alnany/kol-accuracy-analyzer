import { NextResponse } from "next/server";
import { readRecent } from "@/lib/recent";

export async function GET() {
  try {
    const entries = readRecent();
    return NextResponse.json(entries);
  } catch (err) {
    console.error("Recent feed error:", err);
    return NextResponse.json([]);
  }
}
