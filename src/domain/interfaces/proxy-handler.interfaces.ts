import { Request, Response } from 'express';

export interface ProxyHandlerInterface {
  handleRequest(req: Request, res: Response): void;
}
