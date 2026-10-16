import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const motDePasse = process.env.ADMIN_MOT_DE_PASSE ?? "changer-moi";
  const hash = await bcrypt.hash(motDePasse, 10);
  await prisma.praticien.upsert({
    where: { identifiant: "admin" },
    update: {},
    create: {
      identifiant: "admin",
      motDePasse: hash,
      nom: "Administrateur",
      prenoms: "",
      roles: ["ADMIN"],
      actif: true,
    },
  });
  console.log("Compte admin créé (identifiant : admin)");
}

main().finally(() => prisma.$disconnect());
