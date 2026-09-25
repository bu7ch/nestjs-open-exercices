import { MigrationInterface, QueryRunner } from "typeorm";

export class AjouterActifAuProduit1790328319619 implements MigrationInterface {
    name = 'AjouterActifAuProduit1790328319619'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "produits" ADD "actif" boolean NOT NULL DEFAULT true`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "produits" DROP COLUMN "actif"`);
    }

}
