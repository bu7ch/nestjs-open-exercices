import { MigrationInterface, QueryRunner } from "typeorm";

export class RelierVendeursComptes1790419827344 implements MigrationInterface {
    name = 'RelierVendeursComptes1790419827344'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vendeurs" ADD "compteId" integer`);
        await queryRunner.query(`ALTER TABLE "vendeurs" ADD CONSTRAINT "FK_fae1878b5f7019f5688b2694daa" FOREIGN KEY ("compteId") REFERENCES "comptes"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vendeurs" DROP CONSTRAINT "FK_fae1878b5f7019f5688b2694daa"`);
        await queryRunner.query(`ALTER TABLE "vendeurs" DROP COLUMN "compteId"`);
    }

}
