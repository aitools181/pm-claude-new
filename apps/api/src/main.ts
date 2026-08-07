import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";
import { AppErrorFilter } from "./common/app-error.filter.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(cookieParser());
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new AppErrorFilter());
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
  app.get(Logger).log(`API listening on http://0.0.0.0:${port}/api/v1`);
}

bootstrap().catch((e) => { console.error("Fatal boot error:", e); process.exit(1); });
