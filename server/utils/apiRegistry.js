const crypto = require('crypto');

const AUTH_GUARD = /^(?:requireAuth|requireAdmin|authenticate|isAuthenticated)$/i;
const ADMIN_GUARD = /^(?:requireAdmin|isAdmin|adminAuth)$/i;

const normalizePath = (value) => {
  const path = String(value || '/').split('?')[0];
  const normalized = `/${path.split('/').filter(Boolean).join('/')}`;
  return normalized === '/' ? normalized : normalized.replace(/\/$/, '');
};

const joinPaths = (prefix, routePath) => {
  const suffix = routePath === '/' ? '' : String(routePath);
  return normalizePath(`${prefix}/${suffix}`);
};

const titleCase = (value) => String(value || 'API')
  .split(/[-_/\s]+/)
  .filter(Boolean)
  .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
  .join(' ');

const handlerNames = (layers = []) => layers.map((layer) => layer.handle?.name || layer.name || '').filter(Boolean);

const routeMethods = (route) => {
  const methods = Object.entries(route.methods || {})
    .filter(([method, enabled]) => enabled && method !== '_all')
    .map(([method]) => method.toUpperCase());
  return methods.length ? methods : ['ALL'];
};

const compilePattern = (endpoint) => {
  const pieces = normalizePath(endpoint).split('/').filter(Boolean).map((piece) => {
    if (piece === '*') return '.*';
    if (piece.startsWith(':')) return '[^/]+';
    return piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return new RegExp(`^/${pieces.join('/')}/?$`);
};

class ApiRegistry {
  constructor() {
    this.routes = new Map();
  }

  registerRoute(endpoint, method, middlewareNames = [], moduleName = 'API') {
    const role = middlewareNames.some((name) => ADMIN_GUARD.test(name))
      ? 'Admin'
      : middlewareNames.some((name) => AUTH_GUARD.test(name)) ? 'User' : 'Public';
    const normalizedEndpoint = normalizePath(endpoint);
    const routeId = crypto.createHash('sha256').update(`${method}:${normalizedEndpoint}`).digest('hex');
    this.routes.set(routeId, {
      routeId,
      endpoint: normalizedEndpoint,
      method,
      moduleName,
      authenticationRequired: role !== 'Public',
      accessRole: role,
      routePattern: compilePattern(normalizedEndpoint)
    });
  }

  registerRouterMount(prefix, router) {
    if (!router || !Array.isArray(router.stack)) return;
    const moduleSegment = normalizePath(prefix).split('/').filter(Boolean).slice(1).join(' ') || 'API';
    this.#registerStack(normalizePath(prefix), router.stack, [], titleCase(moduleSegment));
  }

  #registerStack(prefix, stack, inheritedGuards, moduleName) {
    const guards = [...inheritedGuards];
    for (const layer of stack) {
      if (layer.route) {
        const routePaths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
        const routeNames = [...guards, ...handlerNames(layer.route.stack)];
        for (const routePath of routePaths) {
          if (typeof routePath !== 'string') continue;
          for (const method of routeMethods(layer.route)) {
            this.registerRoute(joinPaths(prefix, routePath), method, routeNames, moduleName);
          }
        }
        continue;
      }

      if (Array.isArray(layer.handle?.stack)) {
        this.#registerStack(prefix, layer.handle.stack, guards, moduleName);
        continue;
      }

      const name = layer.handle?.name || layer.name || '';
      if (AUTH_GUARD.test(name)) guards.push(name);
    }
  }

  registerDirectRoute(endpoint, method, handlers = [], moduleName = 'API') {
    this.registerRoute(endpoint, method.toUpperCase(), handlers.map((handler) => handler?.name || ''), moduleName);
  }

  resolve(method, requestPath) {
    const normalizedPath = normalizePath(requestPath);
    return [...this.routes.values()].find((route) => (
      (route.method === method || route.method === 'ALL') && route.routePattern.test(normalizedPath)
    )) || null;
  }

  list() {
    return [...this.routes.values()].map(({ routePattern, ...route }) => ({ ...route }));
  }
}

const instrumentApiRegistrations = (app, registry) => {
  const originalUse = app.use.bind(app);
  app.use = (...args) => {
    const [path, ...handlers] = args;
    const result = originalUse(...args);
    if (typeof path === 'string' && path.startsWith('/api')) {
      for (const handler of handlers) registry.registerRouterMount(path, handler);
    }
    return result;
  };

  const originalGet = app.get.bind(app);
  app.get = (path, ...handlers) => {
    const result = originalGet(path, ...handlers);
    if (handlers.length && typeof path === 'string' && path.startsWith('/api')) {
      registry.registerDirectRoute(path, 'GET', handlers);
    }
    return result;
  };

  return app;
};

module.exports = { ApiRegistry, compilePattern, instrumentApiRegistrations, joinPaths, normalizePath };