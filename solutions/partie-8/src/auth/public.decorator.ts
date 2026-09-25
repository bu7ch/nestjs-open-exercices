import { SetMetadata } from '@nestjs/common';

// 7.8 : le guard s'applique partout ; les routes ouvertes se marquent explicitement.
export const EST_PUBLIC = 'estPublic';
export const Public = () => SetMetadata(EST_PUBLIC, true);
