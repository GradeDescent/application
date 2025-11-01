import { Response } from 'express';

export function jsonOk<T>(res: Response, data: T, status = 200) {
  // Ensure RFC3339 UTC timestamps by using ISO strings when serializing dates.
  return res.status(status).json(data);
}

