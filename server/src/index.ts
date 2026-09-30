import Fastify from 'fastify';
import { z } from 'zod';

const app = Fastify({ logger: true });

const SanitizedContextSchema = z.object({
  metadata: z.object({
    url: z.string(),
    timestamp: z.number(),
    domElements: z.array(z.object({
      tagName: z.string(),
      attributes: z.record(z.string()),
      boundingBox: z.object({
        x: z.number(), y: z.number(), width: z.number(), height: z.number()
      }),
      textContent: z.string().optional(),
      isInteractive: z.boolean(),
      piiDetections: z.array(z.object({
        type: z.string(),
        confidence: z.number(),
        location: z.record(z.unknown()),
        originalValue: z.string().optional()
      }))
    })),
    visualRegions: z.array(z.object({
      boundingBox: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
      description: z.string(),
      piiDetections: z.array(z.record(z.unknown())),
      requiresVisionModel: z.boolean()
    })).optional()
  }),
  redactions: z.array(z.object({
    type: z.string(),
    target: z.record(z.unknown()),
    replacement: z.string().optional()
  }))
});

const ActionSchema = z.object({
  type: z.enum(['click', 'fill', 'scroll', 'navigate', 'wait']),
  selector: z.string().optional(),
  coordinates: z.object({ x: z.number(), y: z.number() }).optional(),
  value: z.string().optional(),
  url: z.string().optional(),
  reasoning: z.string()
});

app.post('/reason', async (request, reply) => {
  const parseResult = SanitizedContextSchema.safeParse(request.body);
  if (!parseResult.success) {
    return reply.status(400).send({ error: 'Invalid sanitized context', details: parseResult.error });
  }

  const context = parseResult.data;
  console.log('[SIH-26171] Server received sanitized context for:', context.metadata.url);

  const action = { type: 'wait' as const, reasoning: 'Stub server - no reasoning implemented yet' };
  const validatedAction = ActionSchema.parse(action);
  return validatedAction;
});

app.get('/health', async () => ({ status: 'ok' }));

const start = async () => {
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('[SIH-26171] Server listening on http://0.0.0.0:3000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();