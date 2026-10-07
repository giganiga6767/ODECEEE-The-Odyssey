import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

if (process.loadEnvFile) {
  try { process.loadEnvFile(); } catch {}
}

const required = ["DATABASE_URL", "ADMIN_USERNAME", "ADMIN_PASSWORD"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

const prisma = new PrismaClient();

try {
  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
  await prisma.admin.upsert({
    where: { username: process.env.ADMIN_USERNAME },
    create: { username: process.env.ADMIN_USERNAME, passwordHash, role: "ADMIN" },
    update: { passwordHash, role: "ADMIN" },
  });
  await prisma.gameSettings.upsert({
    where: { id: "global" },
    create: { id: "global" },
    update: {},
  });
  await prisma.eventState.upsert({
    where: { id: "global" },
    create: { id: "global" },
    update: {},
  });

  if ((await prisma.team.count()) === 0) {
    const names = ["Achaeans", "Argonauts", "Spartans", "Olympians"];
    for (const name of names) {
      await prisma.team.create({
        data: {
          name,
          passcodeHash: await bcrypt.hash(randomBytes(8).toString("hex").toUpperCase(), 12),
          codeHint: "",
          members: null,
        },
      });
    }
  }

  if ((await prisma.checkpoint.count()) === 0) {
    const points = [
      [0.0000, 0.0000],
      [0.0004, 0.0002],
      [-0.0003, 0.0005],
      [0.0006, -0.0004],
      [-0.0006, -0.0002],
      [0.0002, -0.0007],
      [-0.0008, 0.0003],
      [0.0008, 0.0006],
    ];
    await prisma.checkpoint.createMany({
      data: points.map(([latOffset, lngOffset], index) => ({
        name: `REPLACE WITH REAL LOCATIONS · Placeholder ${String(index + 1).padStart(2, "0")}`,
        lat: 13.011 + latOffset,
        lng: 74.794 + lngOffset,
        radiusM: 30,
        hint: "Placeholder coordinate. Replace this with the real campus location before the event.",
        isActive: true,
      })),
    });
  }
} finally {
  await prisma.$disconnect();
}
