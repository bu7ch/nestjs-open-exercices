import { MigrationInterface, QueryRunner } from 'typeorm';

// Bonus 11.14 : les événements de paiement déjà reçus (l'identifiant du prestataire en clé primaire).
export class CreerEvenementsRecus1790700000001 implements MigrationInterface {
  name = 'CreerEvenementsRecus1790700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evenements_recus" ("id" character varying NOT NULL, "type" character varying NOT NULL, "recuLe" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_151442b4e8160aa9a7aa6ffee5e" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evenements_recus"`);
  }
}
