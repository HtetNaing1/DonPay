import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { IntentEventsService } from './../src/queues/intent-events.service';
import { WATCH_QUEUE } from './../src/queues/watch-queue.service';

// Boot-time env for hermetic runs (no real database is touched)
process.env['DATABASE_URL'] ??= 'postgresql://test:test@localhost:5432/test';
process.env['AUTH_JWT_SECRET'] ??= 'e2e-secret-that-is-at-least-32-chars!!';
process.env['NODE_ENV'] = 'test';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      // keep the boot hermetic: no Redis either (queue + pub/sub fan-out)
      .overrideProvider(WATCH_QUEUE)
      .useValue({ add: async () => undefined, close: async () => undefined })
      .overrideProvider(IntentEventsService)
      .useValue({
        publish: async () => undefined,
        subscribe: () => undefined,
        onApplicationShutdown: async () => undefined,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health returns ok', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('rejects an invalid signup body with a validation_failed problem', () => {
    return request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'not-an-email', password: 'short', name: '' })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/)
      .expect((res) => {
        if (res.body.code !== 'validation_failed') {
          throw new Error(
            `Expected code validation_failed, got ${res.body.code}`,
          );
        }
        const paths = (res.body.errors as { path: string }[]).map(
          (e) => e.path,
        );
        for (const expected of ['email', 'password', 'name']) {
          if (!paths.includes(expected)) {
            throw new Error(`Expected a validation issue on ${expected}`);
          }
        }
      });
  });

  it('rejects unauthenticated access to /auth/me with 401 problem+json', () => {
    return request(app.getHttpServer())
      .get('/auth/me')
      .expect(401)
      .expect('Content-Type', /application\/problem\+json/)
      .expect((res) => {
        if (res.body.code !== 'unauthorized') {
          throw new Error(`Expected code unauthorized, got ${res.body.code}`);
        }
      });
  });

  it('unknown routes return problem+json with a stable code', () => {
    return request(app.getHttpServer())
      .get('/does-not-exist')
      .expect(404)
      .expect('Content-Type', /application\/problem\+json/)
      .expect((res) => {
        if (res.body.code !== 'not_found') {
          throw new Error(`Expected code not_found, got ${res.body.code}`);
        }
        if (res.body.instance !== '/does-not-exist') {
          throw new Error(
            `Expected instance /does-not-exist, got ${res.body.instance}`,
          );
        }
      });
  });
});
