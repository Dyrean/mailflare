import { desc, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiUsage } from "@/db/schema";
import { getEnv } from "@/lib/cloudflare";
import { requireSessionUser } from "@/lib/api/auth";

const PAGE_SIZE = 20;

export async function GET(request: Request) {
	const env = getEnv();
	const session = await requireSessionUser(env, request);
	if (session.error) return session.error;
	if (session.user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
	const rawPage = new URL(request.url).searchParams.get("page") ?? "1";
	const page = Number(rawPage);
	if (!Number.isSafeInteger(page) || page < 1 || page > Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE)) return Response.json({ error: "Invalid page" }, { status: 400 });
	const db = getDb(env);
	const [totals] = await db.select({
		requests: sql<number>`count(*)`,
		inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
		outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
		costUsdMicros: sql<number>`coalesce(sum(${aiUsage.costUsdMicros}), 0)`,
		pricedRequests: sql<number>`count(${aiUsage.costUsdMicros})`,
	}).from(aiUsage);
	const today = new Date();
	today.setUTCHours(0, 0, 0, 0);
	const start = new Date(today);
	start.setUTCDate(start.getUTCDate() - 29);
	const day = sql<string>`strftime('%Y-%m-%d', ${aiUsage.createdAt}, 'unixepoch')`;
	const daily = await db.select({
		date: day,
		requests: sql<number>`count(*)`,
		inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
		outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
	}).from(aiUsage).where(gte(aiUsage.createdAt, start)).groupBy(day).orderBy(day);
	const rows = await db.select().from(aiUsage).orderBy(desc(aiUsage.createdAt), desc(aiUsage.id)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
	return Response.json({ totals: { ...totals, totalTokens: totals.inputTokens + totals.outputTokens }, daily, rows, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(totals.requests / PAGE_SIZE)) }, { headers: { "Cache-Control": "no-store" } });
}
