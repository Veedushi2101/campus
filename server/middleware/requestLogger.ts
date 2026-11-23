import type {NextFunction, Request, Response} from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }
  const start = Date.now();
  res.on('finish', () => {
    if (!req.path.startsWith('/api/')) return;
    const duration = Date.now() - start;
    // Never log authorization headers, tokens, or request bodies containing credentials
    console.log(`[API] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
}
