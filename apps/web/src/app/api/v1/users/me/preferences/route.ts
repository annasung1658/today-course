import { prisma } from '@/lib/prisma';
import { authedRoute, readJson } from '@/lib/api/handler';
import { userPreferenceSchema } from '@/server/schemas';
import type { PrismaRow } from '@/server/prisma-types';

const serialize = (p: PrismaRow) =>
  p
    ? {
        preferredFoods: p.preferredFoods,
        dislikedFoods: p.dislikedFoods,
        allergies: p.allergies,
        preferredActivities: p.preferredActivities,
        preferredAtmospheres: p.preferredAtmospheres,
        budget:
          p.budgetMin !== null && p.budgetMax !== null
            ? { min: p.budgetMin, max: p.budgetMax, currency: p.budgetCurrency }
            : null,
        mustHave: p.mustHave,
        mustAvoid: p.mustAvoid,
        additionalNotes: p.additionalNotes,
      }
    : null;

export const GET = authedRoute(async ({ session }) => {
  const pref = await prisma.userPreference.findUnique({ where: { userId: session.userId } });
  return serialize(pref);
});

export const PUT = authedRoute(async ({ request, session }) => {
  const input = userPreferenceSchema.parse(await readJson(request));
  const data = {
    preferredFoods: input.preferredFoods,
    dislikedFoods: input.dislikedFoods,
    allergies: input.allergies,
    preferredActivities: input.preferredActivities,
    preferredAtmospheres: input.preferredAtmospheres,
    budgetMin: input.budget?.min ?? null,
    budgetMax: input.budget?.max ?? null,
    budgetCurrency: input.budget?.currency ?? 'KRW',
    mustHave: input.mustHave,
    mustAvoid: input.mustAvoid,
    additionalNotes: input.additionalNotes,
  };

  const saved = await prisma.userPreference.upsert({
    where: { userId: session.userId },
    create: { userId: session.userId, ...data },
    update: data,
  });
  return serialize(saved);
});
