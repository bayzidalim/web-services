require('dotenv').config();
const { requireAdmin } = require('./middleware/auth');
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const multipart = require('@fastify/multipart');
const peopleRoutes = require('./routes/people');
const adminRoutes = require('./routes/admin');
const searchRoutes = require('./routes/search');
const uploadRoutes = require('./routes/uploads');
const publicMediaRoutes = require('./routes/public_media');

const fastify = Fastify({
  logger: true
});

['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`❌ Missing env var: ${key}`);
  }
});

// Register CORS
fastify.register(cors, {
  origin: true, // Allow all for development/public read
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// Register Multipart for file uploads
fastify.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 1, // Only 1 file at a time
  },
});

// Register routes
fastify.register(peopleRoutes, { prefix: '/api/people' });
fastify.register(publicMediaRoutes, { prefix: '/api/media' });
fastify.register(adminRoutes, { prefix: '/api/admin' });
fastify.register(searchRoutes, { prefix: '/api/search' });
fastify.register(uploadRoutes, { prefix: '/api/admin/uploads' });
const storiesRoutes = require('./routes/stories');
fastify.register(storiesRoutes, { prefix: '/api/stories' });

const profileRoutes = require('./routes/profiles');
fastify.register(profileRoutes, { prefix: '/api/profile' });

const postRoutes = require('./routes/posts');
fastify.register(postRoutes, { prefix: '/api/posts' });

const feedRoutes = require('./routes/feed');
fastify.register(feedRoutes, { prefix: '/api/feed' });




const notificationRoutes = require('./routes/notifications');
fastify.register(notificationRoutes, { prefix: '/api/admin/notifications' });

const authRoutes = require('./routes/auth');
fastify.register(authRoutes, { prefix: '/api/auth' });

// Health Check
fastify.get('/', async (request, reply) => {
  return { status: 'ok', message: 'We Bhuiyans Family Back-end' };
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;

    await fastify.listen({
      port,
      host: '0.0.0.0',
    });

    fastify.log.info(`🚀 Server running on http://0.0.0.0:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
fastify.get('/api/admin/health', {
  preHandler: requireAdmin
}, async () => {
  return { ok: true, message: 'Admin backend alive' };
});


start();
