import { NextResponse } from "next/server"
import { getSyncStatus } from "@zlog/database"

export async function GET() {
  return NextResponse.json(getSyncStatus())
}
