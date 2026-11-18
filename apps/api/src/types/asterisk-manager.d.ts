declare module 'asterisk-manager' {
  import type { EventEmitter } from 'node:events';

  export interface AmiAction {
    action: string;
    actionid?: string;
    [key: string]: string | number | boolean | undefined;
  }
  export type AmiResponse = Record<string, string> & { response?: string; message?: string; actionid?: string };
  export type AmiEvent = Record<string, string> & { event: string; actionid?: string };

  interface Manager extends EventEmitter {
    connect(port: number, host: string, cb?: () => void): void;
    login(cb?: (err?: Error) => void): void;
    keepConnected(): void;
    disconnect(cb?: () => void): void;
    isConnected(): boolean;
    action(action: AmiAction, cb?: (err: AmiResponse | null, res: AmiResponse) => void): string;
    on(event: 'managerevent', listener: (evt: AmiEvent) => void): this;
    on(event: 'connect' | 'close' | 'end' | 'disconnect', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'response', listener: (res: AmiResponse) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  interface ManagerConstructor {
    new (port: number, host: string, username: string, password: string, events?: boolean): Manager;
    (port: number, host: string, username: string, password: string, events?: boolean): Manager;
  }
  const AsteriskManager: ManagerConstructor;
  export default AsteriskManager;
}
