// Şemanın sahibi Mixle reposudur (prisma/schema.prisma senkronla gelir).
// Bu proje migration ÇALIŞTIRMAZ; yalnız istemciyi üretir.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
