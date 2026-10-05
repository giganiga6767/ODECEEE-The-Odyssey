import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

export type OdysseySocketEvent =
  | 'target:update'
  | 'checkpoint:captured'
  | 'voyage:complete'
  | 'event:status'
  | 'error:flagged'
  | 'admin:snapshot'
  | 'admin:team:update'
  | 'admin:completion:new';

export type OdysseySocketHandlers = Partial<Record<OdysseySocketEvent, (payload: unknown) => void>>;
export type SocketConnection = 'connecting' | 'connected' | 'disconnected';

export function useOdysseySocket(enabled: boolean, handlers: OdysseySocketHandlers, onConnect?: () => void) {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(handlers);
  const connectHandlerRef = useRef(onConnect);
  const [connection, setConnection] = useState<SocketConnection>('disconnected');
  handlersRef.current = handlers;
  connectHandlerRef.current = onConnect;

  useEffect(() => {
    if (!enabled) {
      setConnection('disconnected');
      return;
    }
    setConnection('connecting');
    const socket = io(window.location.origin, {
      path: '/api/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnection('connected');
      connectHandlerRef.current?.();
    });
    socket.on('disconnect', () => setConnection('disconnected'));
    socket.on('connect_error', () => setConnection('disconnected'));
    const events: OdysseySocketEvent[] = [
      'target:update',
      'checkpoint:captured',
      'voyage:complete',
      'event:status',
      'error:flagged',
      'admin:snapshot',
      'admin:team:update',
      'admin:completion:new',
    ];
    events.forEach((event) => socket.on(event, (payload: unknown) => handlersRef.current[event]?.(payload)));
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      setConnection('disconnected');
    };
  }, [enabled]);

  return { socketRef, connection };
}
