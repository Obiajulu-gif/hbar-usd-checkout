import { NextResponse } from "next/server";
import { readHcsConfig } from "~~/utils/checkout/hcs";

export function GET() {
  return NextResponse.json({ ok: true, hcsConfigured: readHcsConfig() !== null });
}
