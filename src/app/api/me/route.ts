import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ user: null, documents: [] });
  }

  const documents = await prisma.document.findMany({
    where: { userId: sessionUser.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      contractType: true,
      overallRisk: true,
      summary: true,
      createdAt: true,
      _count: { select: { analysisItems: true } },
    },
  });

  return NextResponse.json({
    user: {
      id: sessionUser.userId,
      email: sessionUser.email,
      name: sessionUser.name ?? null,
    },
    documents,
  });
}
