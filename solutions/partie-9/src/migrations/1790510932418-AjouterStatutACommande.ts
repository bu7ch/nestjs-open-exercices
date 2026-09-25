import { MigrationInterface, QueryRunner } from "typeorm";

export class AjouterStatutACommande1790510932418 implements MigrationInterface {
    name = 'AjouterStatutACommande1790510932418'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "commandes" ADD "statut" character varying NOT NULL DEFAULT 'en_attente'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "commandes" DROP COLUMN "statut"`);
    }

}
