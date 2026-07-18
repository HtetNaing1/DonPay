import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker/worker.module';

/** Worker entry point — BullMQ consumers only, no HTTP listener. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks(); // SIGTERM drains the BullMQ worker cleanly
}
void bootstrap();
