import { MigrationInterface, QueryRunner } from "typeorm";

export class AjouterRefreshTokenAuCompte1790424461873 implements MigrationInterface {
    name = 'AjouterRefreshTokenAuCompte1790424461873'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "comptes" ADD "refreshTokenHache" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "comptes" DROP COLUMN "refreshTokenHache"`);
    }

}
