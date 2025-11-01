import { inject } from 'light-my-request';

type AppLike = (req: any, res: any) => void;

class InjectBuilder {
  private app: AppLike;
  private method: string;
  private url: string;
  private headers: Record<string, string> = {};
  private payload: any;

  constructor(app: AppLike, method: string, url: string) {
    this.app = app;
    this.method = method.toUpperCase();
    this.url = url;
  }

  set(key: string, value: string) {
    this.headers[key] = value;
    return this;
  }

  send(body: any) {
    if (typeof body === 'string' || Buffer.isBuffer(body)) {
      this.payload = body;
    } else {
      this.headers['Content-Type'] ||= 'application/json';
      this.payload = JSON.stringify(body);
    }
    return this;
  }

  async then<TResult1 = any, TResult2 = never>(onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null) {
    try {
      const res = await inject(this.app as any, {
        method: this.method,
        url: this.url,
        headers: this.headers,
        payload: this.payload,
      });
      const out: any = {
        status: res.statusCode,
        headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(', ') : String(v)])),
        text: res.payload,
        body: undefined as any,
      };
      const ct = String(out.headers['content-type'] || '');
      if (ct.includes('application/json')) {
        try {
          out.body = JSON.parse(res.payload);
        } catch {
          out.body = res.payload;
        }
      } else {
        out.body = res.payload;
      }
      return onfulfilled ? onfulfilled(out) : out;
    } catch (err) {
      if (onrejected) return onrejected(err as any);
      throw err;
    }
  }
}

export function request(app: AppLike) {
  return {
    get: (url: string) => new InjectBuilder(app, 'GET', url),
    post: (url: string) => new InjectBuilder(app, 'POST', url),
    put: (url: string) => new InjectBuilder(app, 'PUT', url),
    delete: (url: string) => new InjectBuilder(app, 'DELETE', url),
  };
}

