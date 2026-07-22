export const SOCKET_LISTENER = {
  chatSendMessage: 'chat:send-message',
  aiSendMessage: 'ai:send-message',
  chatMyList: 'chat:my-list',
  chatTyping: 'chat:typing',
  chatStopTyping: 'chat:stop-typing',
  chatSeen: 'chat:seen',
  chatEditMessage: 'chat:edit-message',
  chatDeleteMessage: 'chat:delete-message',
} as const;

export const SOCKET_EMIT = {
  chatNewMessage: 'chat:new-message',
  aiMessage: 'ai:message',
  chatList: 'chat:list',
  chatTyping: 'chat:typing',
  chatStopTyping: 'chat:stop-typing',
  chatSeen: 'chat:seen',
  chatMessageUpdated: 'chat:message-updated',
  chatMessageDeleted: 'chat:message-deleted',
  unreadCount: 'notification:unread-count',
  onlineUser: 'onlineUser',
} as const;

