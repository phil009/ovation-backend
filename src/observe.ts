import { createObserveModule } from '@nestjs/observe';

// NestJS Observe: traces, errors, logs and metrics sent to observe.nestjs.com.
// ObserveModule goes first in AppModule's imports; ObserveInstrument is passed to NestFactory.create().
// Credentials come from OBSERVE_APP_KEY and OBSERVE_APP_SECRET in .env.
export const { ObserveModule, ObserveInstrument } = createObserveModule();
