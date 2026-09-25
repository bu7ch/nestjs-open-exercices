import { MigrationInterface, QueryRunner } from "typeorm";

export class AjouterPrixAchatAuProduit1790518476203 implements MigrationInterface {
    name = 'AjouterPrixAchatAuProduit1790518476203'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "produits" ADD "prixAchat" numeric(10,2)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "produits" DROP COLUMN "prixAchat"`);
    }

}
