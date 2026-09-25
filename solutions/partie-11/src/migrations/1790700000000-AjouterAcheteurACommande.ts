import { MigrationInterface, QueryRunner } from 'typeorm';

// 11.5 : le compte qui a passé la commande (null pour les commandes passées avant cette migration).
export class AjouterAcheteurACommande1790700000000 implements MigrationInterface {
  name = 'AjouterAcheteurACommande1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "commandes" ADD "acheteurId" integer`);
    await queryRunner.query(
      `ALTER TABLE "commandes" ADD CONSTRAINT "FK_d6dfd725f3bff579e82ab0b1d11" FOREIGN KEY ("acheteurId") REFERENCES "comptes"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "commandes" DROP CONSTRAINT "FK_d6dfd725f3bff579e82ab0b1d11"`);
    await queryRunner.query(`ALTER TABLE "commandes" DROP COLUMN "acheteurId"`);
  }
}
