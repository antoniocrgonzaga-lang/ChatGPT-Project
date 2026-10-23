import { Scout } from './Scout.js';
import { Interceptor } from './Interceptor.js';
import { DroneTurret } from './DroneTurret.js';
import { HeavyFighter } from './HeavyFighter.js';
import { Mine } from './Mine.js';
import { Carrier } from './Carrier.js';
import { PhaseHunter } from './PhaseHunter.js';
import { Generator } from './Generator.js';
import { PrismLancer } from './PrismLancer.js';

/** Enemy registry: add a new class here to make it spawnable from stage scripts. */
export const ENEMY_TYPES = {
  scout: { cls: Scout, prewarm: 16 },
  interceptor: { cls: Interceptor, prewarm: 6 },
  turret: { cls: DroneTurret, prewarm: 6 },
  heavy: { cls: HeavyFighter, prewarm: 2 },
  mine: { cls: Mine, prewarm: 8 },
  carrier: { cls: Carrier, prewarm: 1 },
  phaseHunter: { cls: PhaseHunter, prewarm: 3 },
  generator: { cls: Generator, prewarm: 3 },
  prismLancer: { cls: PrismLancer, prewarm: 3 },
};
