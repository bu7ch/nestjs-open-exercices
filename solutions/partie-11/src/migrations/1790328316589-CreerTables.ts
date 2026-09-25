import { MigrationInterface, QueryRunner } from "typeorm";

export class CreerTables1790328316589 implements MigrationInterface {
    name = 'CreerTables1790328316589'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "commandes" ("id" SERIAL NOT NULL, "dateCommande" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_048c7aef9a99d4aed24c9054893" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "variantes" ("id" SERIAL NOT NULL, "nom" character varying NOT NULL, "stock" integer NOT NULL DEFAULT '0', "produitId" integer, CONSTRAINT "PK_1167a190c8965c02f8c406d7d88" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "lignes_commande" ("id" SERIAL NOT NULL, "quantite" integer NOT NULL, "commandeId" integer, "varianteId" integer, CONSTRAINT "PK_b075556ad91e84006a2fb6f32a6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "produits" ("id" SERIAL NOT NULL, "nom" character varying NOT NULL, "prix" numeric(10,2) NOT NULL, "categorie" character varying NOT NULL, "vendeurId" integer, CONSTRAINT "PK_738095029a8d184b11939537702" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "vendeurs" ("id" SERIAL NOT NULL, "nom" character varying NOT NULL, CONSTRAINT "PK_99cc4fbebbaa74ca0d807ab2369" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "variantes" ADD CONSTRAINT "FK_a4eb86981be47e04c589da06334" FOREIGN KEY ("produitId") REFERENCES "produits"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lignes_commande" ADD CONSTRAINT "FK_064a0ac67946171bd578bfc12ef" FOREIGN KEY ("commandeId") REFERENCES "commandes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lignes_commande" ADD CONSTRAINT "FK_63a7f38edb3bed3f664a6072cba" FOREIGN KEY ("varianteId") REFERENCES "variantes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "produits" ADD CONSTRAINT "FK_4ae8f544d1ae91c32b67ecfe06c" FOREIGN KEY ("vendeurId") REFERENCES "vendeurs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "produits" DROP CONSTRAINT "FK_4ae8f544d1ae91c32b67ecfe06c"`);
        await queryRunner.query(`ALTER TABLE "lignes_commande" DROP CONSTRAINT "FK_63a7f38edb3bed3f664a6072cba"`);
        await queryRunner.query(`ALTER TABLE "lignes_commande" DROP CONSTRAINT "FK_064a0ac67946171bd578bfc12ef"`);
        await queryRunner.query(`ALTER TABLE "variantes" DROP CONSTRAINT "FK_a4eb86981be47e04c589da06334"`);
        await queryRunner.query(`DROP TABLE "vendeurs"`);
        await queryRunner.query(`DROP TABLE "produits"`);
        await queryRunner.query(`DROP TABLE "lignes_commande"`);
        await queryRunner.query(`DROP TABLE "variantes"`);
        await queryRunner.query(`DROP TABLE "commandes"`);
    }

}
