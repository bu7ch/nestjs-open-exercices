import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

@InputType()
export class CreerVendeurInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  nom: string;

  // 5.24 : sans `@IsOptional()`, `forbidNonWhitelisted` refuserait ce champ.
  @Field({ nullable: true })
  @IsOptional()
  description?: string;
}
