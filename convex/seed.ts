import { internalMutation } from "./_generated/server";

const DEMO_TOKEN = "seed|demo-lender";

const DEMO_TOOLS = [
  { name: "Cordless drill", category: "power tools", condition: "good", description: "18V drill with two batteries and a bit set." },
  { name: "Circular saw", category: "power tools", condition: "fair", description: "7-1/4 inch saw. Blade recently replaced." },
  { name: "Orbital sander", category: "power tools", condition: "good", description: "Random orbital sander with assorted pads." },
  { name: "Hedge trimmer", category: "garden", condition: "good", description: "Electric trimmer, 55 cm blade." },
  { name: "Lawn aerator", category: "garden", condition: "worn", description: "Manual spike aerator." },
  { name: "Stand mixer", category: "kitchen", condition: "good", description: "5-quart mixer with dough hook and whisk." },
  { name: "Pressure canner", category: "kitchen", condition: "fair", description: "Holds seven quart jars." },
  { name: "4-person tent", category: "camping", condition: "good", description: "Three-season tent, easy pitch." },
  { name: "Camp stove", category: "camping", condition: "new", description: "Two-burner propane stove." },
] as const;

/** Idempotent demo data: `npx convex run seed:run` */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("tokenIdentifier", DEMO_TOKEN)).unique();
    if (existing) return { seeded: false, reason: "demo data already present" };
    const ownerId = await ctx.db.insert("users", {
      tokenIdentifier: DEMO_TOKEN,
      name: "Demo Lender",
      role: "user",
      trustedLender: true,
    });
    for (const t of DEMO_TOOLS) await ctx.db.insert("tools", { ownerId, ...t });
    return { seeded: true, tools: DEMO_TOOLS.length };
  },
});
