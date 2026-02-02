/**
 * SSE 流管理器 - 管理实时推送到客户端的事件流
 */

import type { Response } from 'express';

export interface StreamEvent {
  type: 'chunk' | 'message_start' | 'message_end' | 'round_start' | 'round_end' | 'discussion_complete' | 'error';
  discussionId: number;
  data: Record<string, unknown>;
}

class StreamManager {
  private clients: Map<number, Set<Response>> = new Map();

  /**
   * 注册一个 SSE 客户端
   */
  addClient(discussionId: number, res: Response): void {
    if (!this.clients.has(discussionId)) {
      this.clients.set(discussionId, new Set());
    }
    this.clients.get(discussionId)!.add(res);

    res.on('close', () => {
      this.clients.get(discussionId)?.delete(res);
      if (this.clients.get(discussionId)?.size === 0) {
        this.clients.delete(discussionId);
      }
    });
  }

  /**
   * 向所有订阅某讨论的客户端发送事件
   */
  emit(event: StreamEvent): void {
    const clients = this.clients.get(event.discussionId);
    if (!clients) return;

    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of clients) {
      try {
        res.write(payload);
      } catch {
        clients.delete(res);
      }
    }
  }

  /**
   * 检查是否有客户端在监听
   */
  hasClients(discussionId: number): boolean {
    return (this.clients.get(discussionId)?.size ?? 0) > 0;
  }
}

export const streamManager = new StreamManager();
