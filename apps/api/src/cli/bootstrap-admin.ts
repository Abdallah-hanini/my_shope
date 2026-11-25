// Provisions (or confirms) the first platform administrator for an OIDC identity. Run locally by an
// operator with database access; it is idempotent and audited.
//   node dist/cli/bootstrap-admin.js --issuer <iss> --subject <sub> --email <email> --name "<display name>"
import { parseArgs } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { createUserSchema } from '@erp/validation';
import { writeAudit } from '../platform/audit';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      issuer: { type: 'string' },
      subject: { type: 'string' },
      email: { type: 'string' },
      name: { type: 'string' },
    },
  });
  const input = createUserSchema.parse({
    oidcIssuer: values.issuer,
    oidcSubject: values.subject,
    email: values.email,
    displayName: values.name ?? values.email,
    isPlatformAdmin: true,
  });
  const prisma = new PrismaClient();
  try {
    const user = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { oidcIssuer_oidcSubject: { oidcIssuer: input.oidcIssuer, oidcSubject: input.oidcSubject } },
      });
      if (existing?.isPlatformAdmin) return existing;
      const u = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: { isPlatformAdmin: true, version: { increment: 1 } },
          })
        : await tx.user.create({ data: input });
      await writeAudit(
        tx,
        { actorUserId: null, requestId: 'cli:bootstrap-admin' },
        {
          action: 'iam.user.bootstrap-platform-admin',
          entityType: 'user',
          entityId: u.id,
          before: existing ?? undefined,
          after: u,
        },
      );
      return u;
    });
    console.warn(`Platform administrator ready: ${user.id} (${user.email})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
