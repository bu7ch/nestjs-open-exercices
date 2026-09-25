import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ComptesModule } from '../comptes/comptes.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { RolesGuard } from './roles.guard.js';

@Module({
  imports: [
    ComptesModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // 7.8 : un guard global (présent aussi dans les tests, contrairement à useGlobalGuards dans main.ts).
    { provide: APP_GUARD, useClass: AuthGuard },
    // 7.12 : APRÈS AuthGuard, qui range l'identité que RolesGuard lit (7.13).
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
