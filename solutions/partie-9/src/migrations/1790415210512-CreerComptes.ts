import { MigrationInterface, QueryRunner } from "typeorm";

export class CreerComptes1790415210512 implements MigrationInterface {
    name = 'CreerComptes1790415210512'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "comptes" ("id" SERIAL NOT NULL, "email" character varying NOT NULL, "motDePasseHache" character varying NOT NULL, "role" character varying NOT NULL DEFAULT 'acheteur', CONSTRAINT "UQ_8fc293a6e1192ca5d4f5c7cd914" UNIQUE ("email"), CONSTRAINT "PK_f1e9bf900b9220f91b487aeeefd" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "comptes"`);
    }

}
