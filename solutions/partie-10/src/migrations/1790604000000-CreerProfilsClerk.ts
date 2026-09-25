import { MigrationInterface, QueryRunner } from 'typeorm';

// 10.13 : la migration oubliée qu'a trouvée `migration:generate --check` dans la CI : l'entité ProfilClerk
// du bonus 7.25 n'avait jamais eu la sienne (les tests e2e créent les tables avec synchronize).
export class CreerProfilsClerk1790604000000 implements MigrationInterface {
  name = 'CreerProfilsClerk1790604000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "profils_clerk" ("id" SERIAL NOT NULL, "clerkId" character varying NOT NULL, "role" character varying NOT NULL DEFAULT 'acheteur', CONSTRAINT "UQ_6f7bff76b1a14ee494f3248f225" UNIQUE ("clerkId"), CONSTRAINT "PK_23dace259c7999085285532d17a" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "profils_clerk"`);
  }
}
